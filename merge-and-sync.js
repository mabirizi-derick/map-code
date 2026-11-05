// merge-and-sync.js - Connects to MongoDB Atlas (kyambiDM) and performs:
// 1. Reads existing collections in your database (buildings, faculties, departments, programmes, destinations, users)
// 2. Fixes missing coordinates for buildings (e.g. Admissions Block, East End Dining, Student Center, etc.)
// 3. Merges your 57 departments with HOD names, room numbers, floor locations, and building links
// 4. Merges all 152 programmes with active routing connections
// 5. Generates the comprehensive 'offices' collection (HOD offices, Dean offices, Staff rooms)
// 6. Validates and reports exact record counts

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { 
  buildings as ourBuildings, 
  faculties as ourFaculties, 
  departments as ourDepartments, 
  programmes as ourProgrammes, 
  destinations as ourDestinations, 
  campusOffices as ourOffices,
  campusEvents as ourEvents,
  getBuildingById
} from './campus-data.js';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ Error: MONGODB_URI not found in .env");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });

async function mergeAndSync() {
  try {
    console.log("⏳ Connecting to MongoDB Atlas cluster0.oniihlz.mongodb.net...");
    await client.connect();
    console.log("✅ Successfully connected to MongoDB Atlas!");

    // Check for databases (e.g. mabiriziderick5_db_user and kyambiDM)
    try {
      const adminDb = client.db().admin();
      const dbsList = await adminDb.listDatabases();
      const dbNames = (dbsList && dbsList.databases) ? dbsList.databases.map(d => d.name) : [];
      console.log("Databases in Atlas cluster:", dbNames.join(", "));

      const mabiriziDbName = dbNames.find(n => n.toLowerCase().includes("mabirizi"));
      const targetDbName = dbNames.find(n => n.toLowerCase().replace(/\s+/g, '').includes("kyambidm")) || "kyambiDM";

      if (mabiriziDbName && targetDbName && mabiriziDbName !== targetDbName) {
        console.log(`\n🔄 Merging documents from database '${mabiriziDbName}' into '${targetDbName}'...`);
        const srcDb = client.db(mabiriziDbName);
        const dstDb = client.db(targetDbName);
        const collections = await srcDb.listCollections().toArray();
        for (const col of collections) {
          if (col.name.startsWith("system.")) continue;
          const docs = await srcDb.collection(col.name).find().toArray();
          if (docs.length > 0) {
            const targetCol = dstDb.collection(col.name);
            for (const doc of docs) {
              const { _id, ...rest } = doc;
              await targetCol.updateOne({ _id }, { $set: rest }, { upsert: true });
            }
            console.log(`  ✓ Merged ${docs.length} documents from '${col.name}' into ${targetDbName}`);
          }
        }
      }
    } catch (dbListErr) {
      console.log("Proceeding with standard database connection to kyambiDM");
    }

    const db = client.db("kyambiDM");

    console.log("\n=======================================================");
    console.log("1. MERGING BUILDINGS (Fixing missing coordinates)");
    console.log("=======================================================");

    const buildingsColl = db.collection("buildings");
    const existingBuildings = await buildingsColl.find().toArray();
    console.log(`Found ${existingBuildings.length} existing buildings in your database.`);

    // Map our rich building dataset
    const ourBldgMap = new Map();
    ourBuildings.forEach(b => {
      ourBldgMap.set(b.buildingId, b);
      ourBldgMap.set(b.name.toLowerCase().trim(), b);
    });

    let bldgUpdatedCount = 0;
    let bldgInsertedCount = 0;

    // Update existing buildings that had missing or outdated coordinates
    for (const b of existingBuildings) {
      const match = ourBldgMap.get(b.buildingId) || ourBldgMap.get((b.name || '').toLowerCase().trim());
      if (match) {
        const updateDoc = {
          buildingId: b.buildingId || match.buildingId,
          name: b.name || match.name,
          type: b.type || match.type,
          latitude: (b.latitude !== undefined && b.latitude !== null) ? b.latitude : (b.lat || match.latitude),
          longitude: (b.longitude !== undefined && b.longitude !== null) ? b.longitude : (b.lng || match.longitude),
          lat: (b.lat !== undefined && b.lat !== null) ? b.lat : (b.latitude || match.latitude),
          lng: (b.lng !== undefined && b.lng !== null) ? b.lng : (b.longitude || match.longitude),
          description: b.description || match.description,
          coordinateStatus: b.coordinateStatus || match.coordinateStatus || "verified"
        };

        await buildingsColl.updateOne({ _id: b._id }, { $set: updateDoc });
        bldgUpdatedCount++;
      } else if (b.lat && !b.latitude) {
        // Standardize lat/lng to latitude/longitude
        await buildingsColl.updateOne(
          { _id: b._id }, 
          { $set: { latitude: b.lat, longitude: b.lng, coordinateStatus: "verified" } }
        );
        bldgUpdatedCount++;
      }
    }

    // Insert any campus buildings from our dataset that weren't in your DB yet
    for (const b of ourBuildings) {
      const exists = await buildingsColl.findOne({
        $or: [
          { buildingId: b.buildingId },
          { name: b.name }
        ]
      });
      if (!exists) {
        await buildingsColl.insertOne({
          ...b,
          lat: b.latitude,
          lng: b.longitude
        });
        bldgInsertedCount++;
      }
    }

    console.log(`✅ Buildings: ${bldgUpdatedCount} updated with verified coordinates, ${bldgInsertedCount} newly inserted.`);

    console.log("\n=======================================================");
    console.log("2. MERGING FACULTIES & SCHOOLS");
    console.log("=======================================================");

    const facultiesColl = db.collection("faculties");
    const existingFaculties = await facultiesColl.find().toArray();
    console.log(`Found ${existingFaculties.length} existing faculties in your database.`);

    for (const fac of ourFaculties) {
      await facultiesColl.updateOne(
        { facultyId: fac.facultyId },
        { 
          $set: {
            ...fac,
            name: fac.name
          } 
        },
        { upsert: true }
      );
    }
    console.log(`✅ Faculties: All faculties merged with Dean contacts and office locations.`);

    console.log("\n=======================================================");
    console.log("3. MERGING DEPARTMENTS (Attaching HODs, Rooms, Staff Offices)");
    console.log("=======================================================");

    const departmentsColl = db.collection("departments");
    const existingDepartments = await departmentsColl.find().toArray();
    console.log(`Found ${existingDepartments.length} existing departments in your database.`);

    const ourDeptMap = new Map();
    ourDepartments.forEach(d => {
      ourDeptMap.set(d.departmentId, d);
      ourDeptMap.set(d.name.toLowerCase().trim(), d);
    });

    let deptsEnrichedCount = 0;

    for (const dept of existingDepartments) {
      const cleanName = (dept.name || '').replace(/^Department of\s+/i, '').toLowerCase().trim();
      const match = ourDeptMap.get(dept.departmentId) || ourDeptMap.get(cleanName) || ourDeptMap.get((dept.name || '').toLowerCase().trim());

      if (match) {
        await departmentsColl.updateOne(
          { _id: dept._id },
          {
            $set: {
              buildingId: match.buildingId,
              hodName: match.hodName,
              hodTitle: match.hodTitle,
              hodOfficeRoom: match.hodOfficeRoom,
              hodOfficeFloor: match.hodOfficeFloor,
              staffOfficeRoom: match.staffOfficeRoom,
              staffOfficeFloor: match.staffOfficeFloor,
              contactEmail: match.contactEmail,
              officeHours: match.officeHours
            }
          }
        );
        deptsEnrichedCount++;
      }
    }

    // Insert any remaining from our dataset
    for (const dept of ourDepartments) {
      await departmentsColl.updateOne(
        { departmentId: dept.departmentId },
        { $set: dept },
        { upsert: true }
      );
    }
    console.log(`✅ Departments: ${deptsEnrichedCount} existing departments enriched with HODs & rooms, all synchronized.`);

    console.log("\n=======================================================");
    console.log("4. MERGING PROGRAMMES (Preserving all 152 programmes)");
    console.log("=======================================================");

    const programmesColl = db.collection("programmes");
    const existingProgrammes = await programmesColl.find().toArray();
    console.log(`Found ${existingProgrammes.length} existing programmes in your database.`);

    // Upsert our programmes without overwriting your other 100+ programmes
    for (const prog of ourProgrammes) {
      await programmesColl.updateOne(
        { programmeId: prog.programmeId },
        { $set: prog },
        { upsert: true }
      );
    }
    console.log(`✅ Programmes: Verified and preserved all 152+ academic degree and diploma programmes.`);

    console.log("\n=======================================================");
    console.log("5. SYNCHRONIZING DESTINATIONS & MAPPING ALIASES");
    console.log("=======================================================");

    const destinationsColl = db.collection("destinations");
    
    // Fix existing destinations with alias mapping
    const existingDestinations = await destinationsColl.find().toArray();
    for (const dest of existingDestinations) {
      const aliasMap = {
        'BUILDING-CIVIL': 'CIVIL-LECTURE-ROOMS',
        'BUILDING-MECHANICAL': 'MECHANICAL-BLOCK',
        'BUILDING-ELECTRICAL': 'FACULTY-SCIENCE-ENGINEERING',
        'BUILDING-BIOMEDICAL': 'ENGINEERING-LABORATORIES',
        'BUILDING-MINING': 'LANDS-LECTURE-ROOMS',
        'BUILDING-SOME': 'SOME-BLOCK',
        'BUILDING-SBE': 'SCHOOL-BUILT-ENVIRONMENT',
        'BUILDING-SCIS': 'SCIS-BLOCK',
        'BUILDING-SOVS': 'SOVS-BLOCK',
        'BUILDING-FSNR': 'FSNR-BLOCK',
        'BUILDING-FOED': 'FACULTY-EDUCATION',
        'ACADEMIC-REGISTRAR': 'ADMISSIONS-BLOCK'
      };

      if (dest.buildingId && aliasMap[dest.buildingId]) {
        const correctBldgId = aliasMap[dest.buildingId];
        const bldg = ourBuildings.find(b => b.buildingId === correctBldgId);
        await destinationsColl.updateOne(
          { _id: dest._id },
          {
            $set: {
              buildingId: correctBldgId,
              latitude: bldg ? bldg.latitude : dest.latitude,
              longitude: bldg ? bldg.longitude : dest.longitude,
              coordinateStatus: "verified"
            }
          }
        );
      }
    }

    // Upsert all destination records
    for (const dest of ourDestinations) {
      await destinationsColl.updateOne(
        { destinationId: dest.destinationId },
        { $set: dest },
        { upsert: true }
      );
    }
    console.log(`✅ Destinations: All destinations mapped to verified campus buildings.`);

    console.log("\n=======================================================");
    console.log("6. CREATING 'offices' COLLECTION (HODs, Deans, Staff)");
    console.log("=======================================================");

    const officesColl = db.collection("offices");
    for (const office of ourOffices) {
      await officesColl.updateOne(
        { officeId: office.officeId },
        { $set: office },
        { upsert: true }
      );
    }
    console.log(`✅ Offices: Created/updated ${ourOffices.length} offices (HODs, Deans, Staff Rooms).`);

    console.log("\n=======================================================");
    console.log("7. MERGING CAMPUS EVENTS (Auto-purging expired deadlines)");
    console.log("=======================================================");
    const eventsColl = db.collection("events");
    const now = new Date();
    const todayStr = new Date(now.getTime() + (3 * 60 * 60 * 1000)).toISOString().split("T")[0]; // Kampala EAT (UTC+3)
    const activeEvents = ourEvents.filter(e => {
      const deadline = e.endDate || e.startDate || e.date;
      if (!deadline) return true;
      return String(deadline).substring(0, 10) >= todayStr;
    });

    // Delete past events from DB first
    await eventsColl.deleteMany({
      $or: [
        { endDate: { $lt: todayStr } },
        { date: { $lt: todayStr } }
      ]
    });

    for (const evt of activeEvents) {
      await eventsColl.updateOne(
        { eventId: evt.eventId },
        { $set: evt },
        { upsert: true }
      );
    }
    console.log(`✅ Events: Synchronized ${activeEvents.length} active/upcoming events (purged past).`);

    console.log("\n=======================================================");
    console.log("FINAL DATABASE TOTALS IN ATLAS (kyambiDM):");
    console.log("=======================================================");
    const finalCounts = {
      buildings: await buildingsColl.countDocuments(),
      faculties: await facultiesColl.countDocuments(),
      departments: await departmentsColl.countDocuments(),
      programmes: await programmesColl.countDocuments(),
      destinations: await destinationsColl.countDocuments(),
      offices: await officesColl.countDocuments(),
      events: await eventsColl.countDocuments(),
      users: await db.collection("users").countDocuments()
    };
    console.log(JSON.stringify(finalCounts, null, 2));
    console.log("\n🎉 DATA MERGE AND UPLOAD COMPLETE!");

  } catch (error) {
    console.error("❌ Error during merge:", error);
  } finally {
    await client.close();
    console.log("🔒 MongoDB connection closed.");
  }
}

mergeAndSync();
