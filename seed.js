// seed.js - Node.js Database Seeder for MongoDB Atlas
// Connects to process.env.MONGODB_URI and syncs all campus data

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { buildings, faculties, departments, programmes, destinations, campusOffices, campusEvents } from './campus-data.js';

dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ Error: MONGODB_URI is not set in your .env file.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 8000
});

async function seedDatabase() {
  try {
    console.log("⏳ Connecting to MongoDB Atlas...");
    await client.connect();
    console.log("✅ Connected successfully to MongoDB Atlas!");

    const dbName = process.env.MONGODB_DB_NAME || "kyambiDM";
    const db = client.db(dbName);
    console.log(`📂 Target Database: "${dbName}"\n`);

    // 1. SEED BUILDINGS
    console.log(`📍 Uploading ${buildings.length} campus buildings...`);
    const buildingsColl = db.collection("buildings");
    for (const building of buildings) {
      await buildingsColl.updateOne(
        { buildingId: building.buildingId },
        { $set: building },
        { upsert: true }
      );
    }
    console.log(`✅ Buildings synchronized (${buildings.length} records)`);

    // 2. SEED FACULTIES
    console.log(`🏢 Uploading ${faculties.length} faculties & schools...`);
    const facultiesColl = db.collection("faculties");
    for (const faculty of faculties) {
      await facultiesColl.updateOne(
        { facultyId: faculty.facultyId },
        { $set: faculty },
        { upsert: true }
      );
    }
    console.log(`✅ Faculties synchronized (${faculties.length} records)`);

    // 3. SEED DEPARTMENTS
    console.log(`🏛️ Uploading ${departments.length} departments...`);
    const departmentsColl = db.collection("departments");
    for (const dept of departments) {
      await departmentsColl.updateOne(
        { departmentId: dept.departmentId },
        { $set: dept },
        { upsert: true }
      );
    }
    console.log(`✅ Departments synchronized (${departments.length} records)`);

    // 4. SEED PROGRAMMES
    console.log(`🎓 Uploading ${programmes.length} programmes...`);
    const programmesColl = db.collection("programmes");
    for (const prog of programmes) {
      await programmesColl.updateOne(
        { programmeId: prog.programmeId },
        { $set: prog },
        { upsert: true }
      );
    }
    console.log(`✅ Programmes synchronized (${programmes.length} records)`);

    // 5. SEED DESTINATIONS
    console.log(`📌 Uploading ${destinations.length} destinations...`);
    const destinationsColl = db.collection("destinations");
    for (const dest of destinations) {
      await destinationsColl.updateOne(
        { destinationId: dest.destinationId },
        { $set: dest },
        { upsert: true }
      );
    }
    console.log(`✅ Destinations synchronized (${destinations.length} records)`);

    // 6. SEED STAFF & HOD OFFICES
    console.log(`👤 Uploading ${campusOffices.length} staff & HOD offices...`);
    const officesColl = db.collection("offices");
    for (const office of campusOffices) {
      await officesColl.updateOne(
        { officeId: office.officeId },
        { $set: office },
        { upsert: true }
      );
    }
    console.log(`✅ Staff & HOD offices synchronized (${campusOffices.length} records)`);

    // 7. SEED CAMPUS EVENTS (Auto-pruning past events & expired deadlines)
    const now = new Date();
    const todayStr = new Date(now.getTime() + (3 * 60 * 60 * 1000)).toISOString().split("T")[0]; // Kampala EAT (UTC+3)
    const activeEvents = campusEvents.filter(e => {
      const deadline = e.endDate || e.startDate || e.date;
      if (!deadline) return true;
      return String(deadline).substring(0, 10) >= todayStr;
    });

    console.log(`🎉 Uploading ${activeEvents.length} official active/upcoming campus events (auto-purged ${campusEvents.length - activeEvents.length} past)...`);
    const eventsColl = db.collection("events");
    // Permanently remove expired events from database
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
    console.log(`✅ Campus events synchronized (${activeEvents.length} active records)`);

    // Verification check
    const counts = {
      buildings: await buildingsColl.countDocuments(),
      faculties: await facultiesColl.countDocuments(),
      departments: await departmentsColl.countDocuments(),
      programmes: await programmesColl.countDocuments(),
      destinations: await destinationsColl.countDocuments(),
      offices: await officesColl.countDocuments(),
      events: await eventsColl.countDocuments()
    };

    console.log("\n📊 CURRENT DATABASE TOTALS IN ATLAS:");
    console.log(JSON.stringify(counts, null, 2));
    console.log("\n🎉 SUCCESS: All campus data is now in your database!");

  } catch (error) {
    console.error("❌ Database connection error:", error.message);
  } finally {
    await client.close();
    console.log("🔒 Connection closed.");
  }
}

seedDatabase();
