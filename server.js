import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { GoogleGenAI } from '@google/genai';
import { buildings, campusEvents } from './campus-data.js';
import { runCalendarSync } from './sync-kyu-calendar.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Universal CORS & Preflight Middleware (ensures Vercel and cross-origin clients never get blocked)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visitor-id, Accept');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Google Gemini AI Client
let geminiClient = null;
if (process.env.GEMINI_API_KEY) {
  try {
    geminiClient = new GoogleGenAI({});
    console.log("Kyambogo Campus Gemini AI initialized successfully.");
  } catch (err) {
    console.warn("Gemini client initialization warning:", err.message);
  }
}

async function callGeminiAi(prompt, systemInstruction = "", isJson = false) {
  if (!geminiClient) {
    throw new Error("Gemini AI API key not configured");
  }
  const models = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];
  let lastError = null;
  for (const model of models) {
    try {
      const config = {};
      if (systemInstruction) config.systemInstruction = systemInstruction;
      if (isJson) config.responseMimeType = "application/json";

      const res = await geminiClient.models.generateContent({
        model,
        contents: prompt,
        config: Object.keys(config).length > 0 ? config : undefined
      });
      if (res && res.text) {
        return res.text;
      }
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${model} attempt failed:`, err.message);
    }
  }
  throw lastError || new Error("Gemini failed to generate response");
}

// Optional MongoDB Connection (if MONGODB_URI is provided in environment)
let mongoDb = null;
const mongoUri = process.env.MONGODB_URI;

// ==========================================================================
// USER ANALYTICS & CHAT STORAGE ARCHITECTURE
// ==========================================================================
const visitorsSet = new Set();
const todayVisitorsSet = new Set();
let todayDateString = new Date().toISOString().split("T")[0];
let totalVisitsCount = 0;
let chatLogsHistory = [];

// In-Memory AI Cache to protect against Gemini API Quota Limits (Zero API usage for repeated queries)
const aiResponseCache = new Map();
const CACHE_MAX_ENTRIES = 250;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getCacheKey(question, userLocation) {
  const normQ = question.trim().toLowerCase().replace(/[?!.,]/g, '');
  if (!userLocation || typeof userLocation.latitude !== 'number') {
    return `q:${normQ}`;
  }
  const nearId = userLocation.nearestBuilding ? userLocation.nearestBuilding.buildingId : 'none';
  return `loc:${normQ}:${nearId}`;
}

function checkDateRoll() {
  const current = new Date().toISOString().split("T")[0];
  if (current !== todayDateString) {
    todayDateString = current;
    todayVisitorsSet.clear();
  }
}

if (mongoUri) {
  try {
    const mongoClient = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 2000, // Fail fast in 2s if Atlas IP is blocked
      connectTimeoutMS: 2000,
      socketTimeoutMS: 2500
    });
    mongoClient.connect()
      .then(async client => {
        let dbName = process.env.MONGODB_DB_NAME || "kyambiDM";
        
        try {
          const adminDb = client.db().admin();
          const dbsList = await adminDb.listDatabases();
          const dbNames = (dbsList && dbsList.databases) ? dbsList.databases.map(d => d.name) : [];
          console.log("MongoDB Atlas databases detected:", dbNames.join(", "));

          const mabiriziDbName = dbNames.find(n => n.toLowerCase().includes("mabirizi"));
          const kyambiDbName = dbNames.find(n => n.toLowerCase().replace(/\s+/g, '').includes("kyambidm"));

          if (kyambiDbName) {
            dbName = kyambiDbName;
          }

          // Unify documents from mabiriziderick5_db_user into kyambiDM
          if (mabiriziDbName && dbName && mabiriziDbName !== dbName) {
            console.log(`Uniting MongoDB Atlas: Merging documents from "${mabiriziDbName}" into "${dbName}"...`);
            const srcDb = client.db(mabiriziDbName);
            const dstDb = client.db(dbName);
            const cols = await srcDb.listCollections().toArray();
            for (const c of cols) {
              if (c.name.startsWith("system.")) continue;
              const docs = await srcDb.collection(c.name).find().toArray();
              if (docs.length > 0) {
                const targetCol = dstDb.collection(c.name);
                for (const d of docs) {
                  const { _id, ...rest } = d;
                  await targetCol.updateOne({ _id }, { $set: rest }, { upsert: true });
                }
                console.log(`Merged ${docs.length} records for "${c.name}" into ${dbName}`);
              }
            }
          }
        } catch (dbCheckErr) {
          console.log("Standard Atlas connection active for database:", dbName);
        }

        mongoDb = client.db(dbName);
        console.log(`Connected to MongoDB Atlas: database "${dbName}"`);

        // Preload analytics count and recent chats from MongoDB
        try {
          const vCount = await mongoDb.collection("visitors").countDocuments();
          if (vCount > 0) {
            console.log(`Preloaded ${vCount} visitor records from MongoDB Atlas`);
          }
          const storedChats = await mongoDb.collection("ai_chats").find().sort({ timestamp: -1 }).limit(100).toArray();
          if (storedChats && storedChats.length > 0) {
            chatLogsHistory = storedChats;
            console.log(`Preloaded ${storedChats.length} stored user chat logs from MongoDB Atlas`);
          }
        } catch (e) {
          console.warn("MongoDB preloading note:", e.message);
        }
      })
      .catch(err => {
        mongoDb = null;
        let diagnosis = err.message;
        if (err.message && (err.message.includes("SSL alert number 80") || err.message.includes("tlsv1 alert internal error"))) {
          diagnosis = "Atlas connection blocked by IP Access List. In MongoDB Atlas, go to Network Access -> Add IP Address -> Allow Access from Anywhere (0.0.0.0/0). Application running smoothly with in-memory & file-backed store.";
        }
        console.warn("ℹ️ MongoDB Atlas notice:", diagnosis);
      });
  } catch (err) {
    mongoDb = null;
    console.warn("MongoDB initialization notice:", err.message);
  }
}

// Resilient query wrapper: times out in 1.8s so API never hangs on serverless runtimes
export async function safeMongoQuery(queryPromise, fallback) {
  if (!mongoDb || !queryPromise) return fallback;
  try {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Mongo query timeout")), 1800);
    });
    const result = await Promise.race([queryPromise, timeout]);
    clearTimeout(timer);
    return result || fallback;
  } catch (err) {
    return fallback;
  }
}

export function getBuildingById(id) {
  const aliasMap = {
    'BUILDING-NPT': 'NPT-BUILDING',
    'BUILDING-RAC': 'RAC-BUILDING',
    'BUILDING-LANGUAGES': 'DEPT-LANGUAGES-BUILDING',
    'BUILDING-POLICE': 'KYAMBOGO-POLICE-POST',
    'BUILDING-CIVIL': 'CIVIL-LECTURE-ROOMS',
    'BUILDING-MECHANICAL': 'MECHANICAL-BLOCK',
    'BUILDING-ELECTRICAL': 'FACULTY-SCIENCE-ENGINEERING',
    'BUILDING-BIOMEDICAL': 'ENGINEERING-LABORATORIES',
    'BUILDING-MINING': 'LANDS-LECTURE-ROOMS',
    'BUILDING-FOED': 'FACULTY-EDUCATION',
    'BUILDING-SAID': 'ART-DESIGN-BLOCK-29',
    'BUILDING-SOME': 'SOME-BLOCK',
    'BUILDING-SBE': 'SCHOOL-BUILT-ENVIRONMENT',
    'BUILDING-SCIS': 'SCIS-BLOCK',
    'BUILDING-SOVS': 'SOVS-BLOCK',
    'BUILDING-FSNR': 'FSNR-BLOCK',
    'BUILDING-IDAEL': 'ODL-CENTRE',
    'ACADEMIC-REGISTRAR': 'ADMISSIONS-BLOCK',
    'BUILDING-CLB': 'CENTRAL-LECTURE-BLOCK',
    'CLB': 'CENTRAL-LECTURE-BLOCK',
    'CLB-BLOCK': 'CENTRAL-LECTURE-BLOCK'
  };

  const targetId = aliasMap[id] || id;
  return buildings.find(b => b.buildingId === targetId || b.buildingId === id);
}

export const faculties = [
  {
    facultyId: "FOE",
    name: "Faculty of Engineering",
    shortName: "Engineering",
    buildingId: "FACULTY-SCIENCE-ENGINEERING",
    deanName: "Dr. Catherine Wandera (Dean of Engineering)",
    deanOfficeRoom: "Room FE-201",
    deanOfficeFloor: "2nd Floor",
    contactEmail: "dean.engineering@kyu.ac.ug",
    contactPhone: "+256 414 286 238"
  },
  {
    facultyId: "FOED",
    name: "Faculty of Education",
    shortName: "Education",
    buildingId: "FACULTY-EDUCATION",
    deanName: "Assoc. Prof. Joyce Ayikoru (Dean of Education)",
    deanOfficeRoom: "Room ED-101",
    deanOfficeFloor: "1st Floor",
    contactEmail: "dean.education@kyu.ac.ug",
    contactPhone: "+256 414 285 001"
  },
  {
    facultyId: "SAID",
    name: "School of Art and Industrial Design",
    shortName: "Art & Design",
    buildingId: "ART-DESIGN-BLOCK-29",
    deanName: "Dr. Emmanuel Mutungi (Dean SAID)",
    deanOfficeRoom: "Room SA-10",
    deanOfficeFloor: "Ground Floor",
    contactEmail: "dean.said@kyu.ac.ug",
    contactPhone: "+256 414 285 035"
  },
  {
    facultyId: "SOME",
    name: "School of Management and Entrepreneurship",
    shortName: "SOME (Business)",
    buildingId: "SOME-BLOCK",
    deanName: "Dr. Regis Namuddu (Dean SOME)",
    deanOfficeRoom: "Room MB-205",
    deanOfficeFloor: "2nd Floor",
    contactEmail: "dean.management@kyu.ac.ug",
    contactPhone: "+256 414 287 410"
  },
  {
    facultyId: "SBE",
    name: "School of Built Environment",
    shortName: "Built Environment",
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    deanName: "Dr. Anthony Gidudu (Dean SBE)",
    deanOfficeRoom: "Room SBE-105",
    deanOfficeFloor: "1st Floor",
    contactEmail: "dean.builtenvironment@kyu.ac.ug",
    contactPhone: "+256 414 289 112"
  },
  {
    facultyId: "SCIS",
    name: "School of Computing and Information Science",
    shortName: "Computing & IT",
    buildingId: "SCIS-BLOCK",
    deanName: "Dr. John B. Ngubiri (Dean SCIS)",
    deanOfficeRoom: "Room CS-301",
    deanOfficeFloor: "3rd Floor",
    contactEmail: "dean.computing@kyu.ac.ug",
    contactPhone: "+256 414 285 540"
  },
  {
    facultyId: "SOVS",
    name: "School of Vocational Studies",
    shortName: "Vocational Studies",
    buildingId: "SOVS-BLOCK",
    deanName: "Dr. Florence Kyomugisha (Dean SOVS)",
    deanOfficeRoom: "Room VS-102",
    deanOfficeFloor: "1st Floor",
    contactEmail: "dean.vocational@kyu.ac.ug",
    contactPhone: "+256 414 286 090"
  },
  {
    facultyId: "FSNR",
    name: "Faculty of Special Needs and Rehabilitation",
    shortName: "Special Needs",
    buildingId: "FSNR-BLOCK",
    deanName: "Dr. Patrick Ojok (Dean FSNR)",
    deanOfficeRoom: "Room SN-101",
    deanOfficeFloor: "Ground Floor",
    contactEmail: "dean.specialneeds@kyu.ac.ug",
    contactPhone: "+256 414 285 020"
  },
  {
    facultyId: "FOA",
    name: "Faculty of Agriculture and Animal Sciences",
    shortName: "Agriculture",
    buildingId: "FACULTY-AGRICULTURE",
    deanName: "Assoc. Prof. Joseph Ssennyonga (Dean of Agriculture)",
    deanOfficeRoom: "Room AG-201",
    deanOfficeFloor: "2nd Floor",
    contactEmail: "dean.agriculture@kyu.ac.ug",
    contactPhone: "+256 414 286 780"
  },
  {
    facultyId: "IDAEL",
    name: "Institute of Distance Education, e-Learning & Learning Centres",
    shortName: "Distance / e-Learning",
    buildingId: "ODL-CENTRE",
    deanName: "Dr. Robert Ayine (Director IDAEL)",
    deanOfficeRoom: "Room ODL-202",
    deanOfficeFloor: "2nd Floor",
    contactEmail: "director.idael@kyu.ac.ug",
    contactPhone: "+256 414 287 333"
  },
  {
    facultyId: "FAH",
    name: "Faculty of Arts and Humanities",
    shortName: "Arts & Humanities",
    buildingId: "FACULTY-ARTS",
    deanName: "Assoc. Prof. Dr. Robert Ojambo (Dean of Arts)",
    deanOfficeRoom: "Dean's Suite, Room A-101",
    deanOfficeFloor: "1st Floor",
    contactEmail: "dean.arts@kyu.ac.ug",
    contactPhone: "+256 414 285 240"
  }
];

export const departments = [
  // Faculty of Engineering
  {
    departmentId: "FOE-CIVIL",
    name: "Civil and Environmental Engineering",
    facultyId: "FOE",
    buildingId: "CIVIL-LECTURE-ROOMS",
    hodName: "Eng. Dr. Michael Kigozi",
    hodTitle: "Head of Department (HOD) - Civil Engineering",
    hodOfficeRoom: "Room C-102",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room C-105 (Lecturers Common Room)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.civil@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOE-MECHANICAL",
    name: "Mechanical and Production Engineering",
    facultyId: "FOE",
    buildingId: "MECHANICAL-BLOCK",
    hodName: "Dr. Joseph Byaruhanga",
    hodTitle: "Head of Department (HOD) - Mechanical Engineering",
    hodOfficeRoom: "Room M-110",
    hodOfficeFloor: "Ground Floor",
    staffOfficeRoom: "Room M-114 (Staff Room)",
    staffOfficeFloor: "Ground Floor",
    contactEmail: "hod.mechanical@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOE-ELECTRICAL",
    name: "Electrical and Electronics Engineering",
    facultyId: "FOE",
    buildingId: "FACULTY-SCIENCE-ENGINEERING",
    hodName: "Dr. Emmanuel Wokorach",
    hodTitle: "Head of Department (HOD) - Electrical Engineering",
    hodOfficeRoom: "Room EE-104",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room EE-108 (Faculty Offices)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.electrical@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOE-BIOMEDICAL",
    name: "Biomedical and Mechatronics Engineering",
    facultyId: "FOE",
    buildingId: "ENGINEERING-LABORATORIES",
    hodName: "Dr. Ronald Kayiwa",
    hodTitle: "Head of Department (HOD) - Biomedical & Mechatronics",
    hodOfficeRoom: "Room BM-201",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room BM-204 (Bio-Engineering Staff)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.biomedical@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:30 AM – 4:30 PM"
  },
  {
    departmentId: "FOE-MINING",
    name: "Mining, Chemical and Petroleum Engineering",
    facultyId: "FOE",
    buildingId: "LANDS-LECTURE-ROOMS",
    hodName: "Dr. Peter Lating",
    hodTitle: "Head of Department (HOD) - Mining & Petroleum",
    hodOfficeRoom: "Room MP-102",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room MP-106 (Department Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.mining@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // Faculty of Education
  {
    departmentId: "FOED-FEP",
    name: "Foundations of Education and Educational Psychology",
    facultyId: "FOED",
    buildingId: "FACULTY-EDUCATION",
    hodName: "Dr. Grace Lubaale",
    hodTitle: "Head of Department (HOD) - Foundations of Education",
    hodOfficeRoom: "Room ED-203",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room ED-205 (Psychology Staff)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.fep@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOED-TEE",
    name: "Teacher Education and Extension",
    facultyId: "FOED",
    buildingId: "FACULTY-EDUCATION",
    hodName: "Dr. Mary Goretti Nakabugo",
    hodTitle: "Head of Department (HOD) - Teacher Education",
    hodOfficeRoom: "Room ED-104",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room ED-107 (Teacher Ed Staff Room)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.tee@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOED-EPM",
    name: "Educational Planning and Management",
    facultyId: "FOED",
    buildingId: "FACULTY-EDUCATION",
    hodName: "Dr. David Onen",
    hodTitle: "Head of Department (HOD) - Educational Planning",
    hodOfficeRoom: "Room ED-302",
    hodOfficeFloor: "3rd Floor",
    staffOfficeRoom: "Room ED-306 (Admin & Staff)",
    staffOfficeFloor: "3rd Floor",
    contactEmail: "hod.epm@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOED-CPEM",
    name: "Curriculum, Pedagogy and Educational Media",
    facultyId: "FOED",
    buildingId: "FACULTY-EDUCATION",
    hodName: "Dr. Richard Ouma",
    hodTitle: "Head of Department (HOD) - Curriculum & Pedagogy",
    hodOfficeRoom: "Room ED-211",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room ED-215 (Pedagogy Lecturers)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.cpem@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOED-ECPPE",
    name: "Early Childhood and Pre-Primary Education",
    facultyId: "FOED",
    buildingId: "FACULTY-EDUCATION",
    hodName: "Dr. Proscovia Namubiru",
    hodTitle: "Head of Department (HOD) - Early Childhood Ed",
    hodOfficeRoom: "Room ED-115",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room ED-118 (Staff Room)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.ecppe@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FOED-TTIE",
    name: "Technical Teacher and Instructor Education",
    facultyId: "FOED",
    buildingId: "TECHNICAL-TEACHER-BLOCK",
    hodName: "Dr. Francis Mugisha",
    hodTitle: "Head of Department (HOD) - Technical Instructor Ed",
    hodOfficeRoom: "Room TT-101",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room TT-105 (Instructor Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.ttie@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // School of Art and Industrial Design
  {
    departmentId: "SAID-FA",
    name: "Fine Art",
    facultyId: "SAID",
    buildingId: "ART-DESIGN-BLOCK-29",
    hodName: "Mr. Godfrey Banadda",
    hodTitle: "Head of Department (HOD) - Fine Art",
    hodOfficeRoom: "Room SA-12",
    hodOfficeFloor: "Ground Floor",
    staffOfficeRoom: "Room SA-14 (Artists Studio & Staff Room)",
    staffOfficeFloor: "Ground Floor",
    contactEmail: "hod.fineart@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SAID-ICA",
    name: "Industrial and Commercial Art",
    facultyId: "SAID",
    buildingId: "ART-DESIGN-BLOCK-29",
    hodName: "Ms. Julian Nyachwo",
    hodTitle: "Head of Department (HOD) - Industrial Art",
    hodOfficeRoom: "Room SA-18",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room SA-20 (Design Studios)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.ica@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SAID-VC",
    name: "Visual Communication (Graphics)",
    facultyId: "SAID",
    buildingId: "ART-DESIGN-BLOCK-29",
    hodName: "Mr. Paul Kizito",
    hodTitle: "Head of Department (HOD) - Visual Communication",
    hodOfficeRoom: "Room SA-22",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room SA-25 (Graphics Lab Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.graphics@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // School of Management and Entrepreneurship
  {
    departmentId: "SOME-AF",
    name: "Accounting and Finance",
    facultyId: "SOME",
    buildingId: "SOME-BLOCK",
    hodName: "Dr. Stephen Nkundabanyanga",
    hodTitle: "Head of Department (HOD) - Accounting & Finance",
    hodOfficeRoom: "Room MB-201",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room MB-203 (Lecturers Offices)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.accounting@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SOME-BAE",
    name: "Business Administration and Entrepreneurship",
    facultyId: "SOME",
    buildingId: "SOME-BLOCK",
    hodName: "Dr. Fredrick Nsubuga",
    hodTitle: "Head of Department (HOD) - Business Administration",
    hodOfficeRoom: "Room MB-108",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room MB-112 (Business Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.bae@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SOME-MS",
    name: "Management Science",
    facultyId: "SOME",
    buildingId: "SOME-BLOCK",
    hodName: "Dr. Benon Basheka",
    hodTitle: "Head of Department (HOD) - Management Science",
    hodOfficeRoom: "Room MB-301",
    hodOfficeFloor: "3rd Floor",
    staffOfficeRoom: "Room MB-305 (Staff Room)",
    staffOfficeFloor: "3rd Floor",
    contactEmail: "hod.mgtsci@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SOME-PM",
    name: "Procurement and Marketing",
    facultyId: "SOME",
    buildingId: "SOME-BLOCK",
    hodName: "Dr. Sarah Eyaa",
    hodTitle: "Head of Department (HOD) - Procurement & Marketing",
    hodOfficeRoom: "Room MB-210",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room MB-214 (Department Staff)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.procurement@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SOME-ECON",
    name: "Department of Economics",
    facultyId: "SOME",
    buildingId: "SOME-BLOCK",
    hodName: "Dr. Eria Hisali",
    hodTitle: "Head of Department (HOD) - Department of Economics",
    hodOfficeRoom: "Room MB-218 (Economics Department)",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room MB-220 (Economics Lecturers Staff Room)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.economics@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // School of Built Environment
  {
    departmentId: "SBE-QSPV",
    name: "Quantity Surveying and Property Valuation",
    facultyId: "SBE",
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    hodName: "Surv. Moses Musinguzi",
    hodTitle: "Head of Department (HOD) - Quantity Surveying",
    hodOfficeRoom: "Room SBE-202",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room SBE-206 (Surveying Staff Room)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.qspv@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SBE-ARCH",
    name: "Architecture",
    facultyId: "SBE",
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    hodName: "Arch. Kenneth Ssemwogerere",
    hodTitle: "Head of Department (HOD) - Architecture",
    hodOfficeRoom: "Room SBE-102",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room SBE-108 (Architecture Studios Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.architecture@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SBE-GEO",
    name: "Geo-informatics (Land Survey)",
    facultyId: "SBE",
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    hodName: "Dr. Ronald Ssengendo",
    hodTitle: "Head of Department (HOD) - Geo-informatics & Land Survey",
    hodOfficeRoom: "Room SBE-212",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room SBE-215 (GIS & Survey Staff)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.geoinformatics@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // School of Computing and Information Science
  {
    departmentId: "SCIS-CS",
    name: "Computer Science & Information Technology (BITC)",
    facultyId: "SCIS",
    buildingId: "FACULTY-SCIENCE-ENGINEERING",
    hodName: "Dr. Jude Lubega",
    hodTitle: "Head of Department (HOD) - Computer Science & IT (BITC)",
    hodOfficeRoom: "Engineering Complex Wing B, Room EC-108",
    hodOfficeFloor: "Ground Floor",
    staffOfficeRoom: "Engineering Tech Lab 2 (Computing & IT Staff)",
    staffOfficeFloor: "Ground Floor",
    contactEmail: "hod.cs@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SCIS-DSNAI",
    name: "Data Science, Networks and Artificial Intelligence",
    facultyId: "SCIS",
    buildingId: "SCIS-BLOCK",
    hodName: "Dr. Agnes Semwanga",
    hodTitle: "Head of Department (HOD) - Data Science & AI",
    hodOfficeRoom: "Room CS-215",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room CS-218 (AI Lab & Staff)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.dsnai@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SCIS-LIS",
    name: "Library and Information Science (BLIS)",
    facultyId: "SCIS",
    buildingId: "CENTRAL-LIBRARY",
    hodName: "Dr. Prisca Tibenderana",
    hodTitle: "Head of Department (HOD) - Library & Info Science (BLIS)",
    hodOfficeRoom: "Central Library 1st Floor (ICT & LIS Wing)",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Central Library Room L-108 (LIS Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.lis@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // Faculty of Agriculture and Animal Sciences
  {
    departmentId: "AGR-DEPT",
    name: "Department of Agriculture and Animal Production",
    facultyId: "FOA",
    buildingId: "FACULTY-AGRICULTURE",
    hodName: "Dr. Florence Kiwumulo",
    hodTitle: "Head of Department (HOD) - Agriculture & Animal Sciences",
    hodOfficeRoom: "Room AG-102",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room AG-105 (Agric Staff & Extension Lab)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.agriculture@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM",
    description: "Training and applied research in modern agronomy, animal husbandry, agricultural education, horticulture, and sustainable agribusiness."
  },

  // School of Vocational Studies
  {
    departmentId: "SOVS-FLCS",
    name: "Family Life and Consumer Studies",
    facultyId: "SOVS",
    buildingId: "SOVS-BLOCK",
    hodName: "Dr. Harriet Nabushawo",
    hodTitle: "Head of Department (HOD) - Family Life & Consumer Studies",
    hodOfficeRoom: "Room VS-202",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room VS-205 (Home Economics Staff)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.flcs@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SOVS-NSD",
    name: "Nutritional Science and Dietetics",
    facultyId: "SOVS",
    buildingId: "SOVS-BLOCK",
    hodName: "Dr. Robert Mwadime",
    hodTitle: "Head of Department (HOD) - Nutrition & Dietetics",
    hodOfficeRoom: "Room VS-208",
    hodOfficeFloor: "2nd Floor",
    staffOfficeRoom: "Room VS-211 (Nutrition Staff)",
    staffOfficeFloor: "2nd Floor",
    contactEmail: "hod.nutrition@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SOVS-HIC",
    name: "Hotel and Institutional Catering",
    facultyId: "SOVS",
    buildingId: "SOVS-BLOCK",
    hodName: "Mrs. Teddy Nabatanzi",
    hodTitle: "Head of Department (HOD) - Hotel & Catering",
    hodOfficeRoom: "Room VS-105",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room VS-109 (Culinary & Hospitality Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.catering@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "SOVS-CF",
    name: "Cosmetology and Fashion",
    facultyId: "SOVS",
    buildingId: "SOVS-BLOCK",
    hodName: "Ms. Juliet Babirye",
    hodTitle: "Head of Department (HOD) - Cosmetology & Fashion",
    hodOfficeRoom: "Room VS-112",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room VS-115 (Apparel & Fashion Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.fashion@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // Faculty of Special Needs & Rehabilitation
  {
    departmentId: "FSNR-CDS",
    name: "Community-Based Rehabilitation & Disability Studies",
    facultyId: "FSNR",
    buildingId: "FSNR-BLOCK",
    hodName: "Dr. Alice Wabule",
    hodTitle: "Head of Department (HOD) - Community Rehabilitation",
    hodOfficeRoom: "Room SN-104",
    hodOfficeFloor: "Ground Floor",
    staffOfficeRoom: "Room SN-108 (Rehab Staff Room)",
    staffOfficeFloor: "Ground Floor",
    contactEmail: "hod.rehab@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FSNR-VIS",
    name: "Visual Impairment and Mobility Studies",
    facultyId: "FSNR",
    buildingId: "FSNR-BLOCK",
    hodName: "Dr. Martin Babu",
    hodTitle: "Head of Department (HOD) - Visual Impairment",
    hodOfficeRoom: "Room SN-112",
    hodOfficeFloor: "Ground Floor",
    staffOfficeRoom: "Room SN-115 (Braille & Mobility Staff)",
    staffOfficeFloor: "Ground Floor",
    contactEmail: "hod.visual@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FSNR-HSLIS",
    name: "Hearing Impairment & Sign Language Interpreting Studies",
    facultyId: "FSNR",
    buildingId: "FSNR-BLOCK",
    hodName: "Dr. Sam Lutalo-Kiingi",
    hodTitle: "Head of Department (HOD) - Sign Language & Deaf Studies",
    hodOfficeRoom: "Room SN-201",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room SN-204 (Sign Language Lab Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.signlanguage@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FSNR-ACOLL",
    name: "Adult and Community Lifelong Learning",
    facultyId: "FSNR",
    buildingId: "FSNR-BLOCK",
    hodName: "Dr. George Lwanga",
    hodTitle: "Head of Department (HOD) - Adult Education",
    hodOfficeRoom: "Room SN-209",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room SN-212 (Adult Ed Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.acoll@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },
  {
    departmentId: "FSNR-IDDS",
    name: "Intellectual Disabilities & Developmental Studies",
    facultyId: "FSNR",
    buildingId: "FSNR-BLOCK",
    hodName: "Dr. Deborah Kisitu",
    hodTitle: "Head of Department (HOD) - Special Needs Education",
    hodOfficeRoom: "Room SN-216",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room SN-220 (Special Ed Staff)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.idds@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  },

  // Institute of Distance Education, e-Learning & Learning Centres
  {
    departmentId: "IDAEL-CDE",
    name: "Centre for Distance and External Education",
    facultyId: "IDAEL",
    buildingId: "ODL-CENTRE",
    hodName: "Dr. James Oonyu",
    hodTitle: "Head of Department (HOD) - Distance Education",
    hodOfficeRoom: "Room ODL-105",
    hodOfficeFloor: "1st Floor",
    staffOfficeRoom: "Room ODL-109 (External Lecturers & Tutors)",
    staffOfficeFloor: "1st Floor",
    contactEmail: "hod.distance@kyu.ac.ug",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM"
  }
];

export const programmes = [
  // Faculty of Education
  {
    programmeId: "BTE",
    name: "Bachelor of Teacher Education",
    departmentId: "FOED-TEE",
    facultyId: "FOED",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "PGDEM",
    name: "Post Graduate Diploma in Educational Management and Leadership",
    departmentId: "FOED-EPM",
    facultyId: "FOED",
    level: "Postgraduate Diploma"
  },
  {
    programmeId: "MEDPPM",
    name: "Master of Education in Policy, Planning and Management",
    departmentId: "FOED-EPM",
    facultyId: "FOED",
    level: "Masters Degree"
  },

  // School of Art and Industrial Design
  {
    programmeId: "BFA",
    name: "Bachelor of Fine Art",
    departmentId: "SAID-FA",
    facultyId: "SAID",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BICA",
    name: "Bachelor of Industrial and Commercial Art",
    departmentId: "SAID-ICA",
    facultyId: "SAID",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BVC",
    name: "Bachelor of Visual Communication and Graphics",
    departmentId: "SAID-VC",
    facultyId: "SAID",
    level: "Undergraduate Degree"
  },

  // School of Management and Entrepreneurship
  {
    programmeId: "AF",
    name: "Bachelor of Science in Accounting and Finance",
    departmentId: "SOME-AF",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DAF",
    name: "Diploma in Accounting and Finance",
    departmentId: "SOME-AF",
    facultyId: "SOME",
    level: "Diploma"
  },
  {
    programmeId: "BAS",
    name: "Bachelor of Administrative Science",
    departmentId: "SOME-BAE",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BBA",
    name: "Bachelor of Business Administration",
    departmentId: "SOME-BAE",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BBS-ED",
    name: "Bachelor of Business Studies with Education",
    departmentId: "SOME-BAE",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DBA",
    name: "Diploma in Business Administration",
    departmentId: "SOME-BAE",
    facultyId: "SOME",
    level: "Diploma"
  },
  {
    programmeId: "DOM",
    name: "Diploma in Office Management",
    departmentId: "SOME-BAE",
    facultyId: "SOME",
    level: "Diploma"
  },
  {
    programmeId: "BMS",
    name: "Bachelor of Management Science",
    departmentId: "SOME-MS",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BPLM",
    name: "Bachelor of Procurement and Logistics Management",
    departmentId: "SOME-PM",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DPLM",
    name: "Diploma in Procurement and Logistics",
    departmentId: "SOME-PM",
    facultyId: "SOME",
    level: "Diploma"
  },
  {
    programmeId: "BSES",
    name: "Bachelor of Science in Economics and Statistics",
    departmentId: "SOME-ECON",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BAE",
    name: "Bachelor of Arts in Economics",
    departmentId: "SOME-ECON",
    facultyId: "SOME",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DMED",
    name: "Diploma in Microfinance and Community Economic Development",
    departmentId: "SOME-ECON",
    facultyId: "SOME",
    level: "Diploma"
  },
  {
    programmeId: "MEST",
    name: "Master of Science in Economics",
    departmentId: "SOME-ECON",
    facultyId: "SOME",
    level: "Postgraduate Degree"
  },

  // School of Built Environment
  {
    programmeId: "BARCH",
    name: "Bachelor of Architecture",
    departmentId: "SBE-ARCH",
    facultyId: "SBE",
    level: "Undergraduate Degree (5 Years)"
  },
  {
    programmeId: "BSE",
    name: "Bachelor of Science in Building Economics",
    departmentId: "SBE-QSPV",
    facultyId: "SBE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BSPLM",
    name: "Bachelor of Science in Property Valuation and Land Management",
    departmentId: "SBE-QSPV",
    facultyId: "SBE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BSGIS",
    name: "Bachelor of Surveying and Land Information Systems",
    departmentId: "SBE-GEO",
    facultyId: "SBE",
    level: "Undergraduate Degree"
  },

  // School of Computing & Information Science
  {
    programmeId: "SCIS-BITC",
    name: "Bachelor of Information Technology and Computing",
    departmentId: "SCIS-CS",
    facultyId: "SCIS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "SCIS-BIS",
    name: "Bachelor of Information Systems",
    departmentId: "SCIS-CS",
    facultyId: "SCIS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "SCIS-BCS",
    name: "Bachelor of Science in Computer Science",
    departmentId: "SCIS-CS",
    facultyId: "SCIS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "SCIS-DS",
    name: "Bachelor of Science in Data Science and Artificial Intelligence",
    departmentId: "SCIS-DSNAI",
    facultyId: "SCIS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BLIS",
    name: "Bachelor of Library and Information Science",
    departmentId: "SCIS-LIS",
    facultyId: "SCIS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DLIS",
    name: "Diploma in Library and Information Science",
    departmentId: "SCIS-LIS",
    facultyId: "SCIS",
    level: "Diploma"
  },

  // Faculty of Engineering
  {
    programmeId: "FOE-CIVIL-BSC",
    name: "Bachelor of Engineering in Civil and Building Engineering",
    departmentId: "FOE-CIVIL",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FOE-CIVIL-DIP",
    name: "Higher Diploma in Civil Engineering",
    departmentId: "FOE-CIVIL",
    facultyId: "FOE",
    level: "Higher Diploma"
  },
  {
    programmeId: "FOE-MECH-BSC",
    name: "Bachelor of Engineering in Mechanical and Manufacturing Engineering",
    departmentId: "FOE-MECHANICAL",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FOE-ELEC-BSC",
    name: "Bachelor of Engineering in Electrical and Electronics Engineering",
    departmentId: "FOE-ELECTRICAL",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FOE-TELE-BSC",
    name: "Bachelor of Engineering in Telecommunication Engineering",
    departmentId: "FOE-ELECTRICAL",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FOE-BIOMED-BSC",
    name: "Bachelor of Engineering in Biomedical Engineering",
    departmentId: "FOE-BIOMEDICAL",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FOE-MECHA-BSC",
    name: "Bachelor of Engineering in Mechatronics and Robotics",
    departmentId: "FOE-BIOMEDICAL",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FOE-MINING-BSC",
    name: "Bachelor of Science in Mining and Petroleum Engineering",
    departmentId: "FOE-MINING",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FOE-CHEM-BSC",
    name: "Bachelor of Science in Chemical Engineering",
    departmentId: "FOE-MINING",
    facultyId: "FOE",
    level: "Undergraduate Degree"
  },

  // School of Vocational Studies
  {
    programmeId: "BVS-HE",
    name: "Bachelor of Vocational Studies in Home Economics with Education",
    departmentId: "SOVS-FLCS",
    facultyId: "SOVS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DHEVE",
    name: "Diploma in Home Economics Vocational Education Secondary",
    departmentId: "SOVS-FLCS",
    facultyId: "SOVS",
    level: "Diploma"
  },
  {
    programmeId: "BHND",
    name: "Bachelor of Science in Human Nutrition and Dietetics",
    departmentId: "SOVS-NSD",
    facultyId: "SOVS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "BHIC",
    name: "Bachelor of Hotel and Institutional Catering",
    departmentId: "SOVS-HIC",
    facultyId: "SOVS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DHIC",
    name: "Diploma in Hotel and Institutional Catering",
    departmentId: "SOVS-HIC",
    facultyId: "SOVS",
    level: "Diploma"
  },
  {
    programmeId: "BFC",
    name: "Bachelor of Fashion and Cosmetology",
    departmentId: "SOVS-CF",
    facultyId: "SOVS",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "DFA",
    name: "Diploma in Fashion and Apparel Design",
    departmentId: "SOVS-CF",
    facultyId: "SOVS",
    level: "Diploma"
  },

  // Faculty of Special Needs & Rehabilitation
  {
    programmeId: "FSNR-BCBR",
    name: "Bachelor of Community-Based Rehabilitation",
    departmentId: "FSNR-CDS",
    facultyId: "FSNR",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FSNR-BCDSJ",
    name: "Bachelor of Community Development and Social Justice",
    departmentId: "FSNR-CDS",
    facultyId: "FSNR",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FSNR-BACE",
    name: "Bachelor of Adult and Community Education",
    departmentId: "FSNR-ACOLL",
    facultyId: "FSNR",
    level: "Undergraduate Degree"
  },
  {
    programmeId: "FSNR-DCBR",
    name: "Diploma in Community-Based Rehabilitation",
    departmentId: "FSNR-CDS",
    facultyId: "FSNR",
    level: "Diploma"
  },
  {
    programmeId: "FSNR-DMR",
    name: "Diploma in Mobility and Rehabilitation",
    departmentId: "FSNR-VIS",
    facultyId: "FSNR",
    level: "Diploma"
  },
  {
    programmeId: "FSNR-DUSLI",
    name: "Diploma in Ugandan Sign Language Interpreting",
    departmentId: "FSNR-HSLIS",
    facultyId: "FSNR",
    level: "Diploma"
  },
  {
    programmeId: "FSNR-CUSLI",
    name: "Certificate in Ugandan Sign Language Interpreting",
    departmentId: "FSNR-HSLIS",
    facultyId: "FSNR",
    level: "Certificate"
  },
  {
    programmeId: "FSNR-CACE",
    name: "Certificate in Adult and Community Education",
    departmentId: "FSNR-ACOLL",
    facultyId: "FSNR",
    level: "Certificate"
  },
  {
    programmeId: "FSNR-PHD-SNE",
    name: "PhD in Special Needs Education",
    departmentId: "FSNR-IDDS",
    facultyId: "FSNR",
    level: "Doctorate"
  },
  {
    programmeId: "FSNR-MSN",
    name: "Master of Special Needs Education",
    departmentId: "FSNR-IDDS",
    facultyId: "FSNR",
    level: "Masters Degree"
  },
  {
    programmeId: "FSNR-MDSID",
    name: "Master of Disability Studies and Inclusive Development",
    departmentId: "FSNR-CDS",
    facultyId: "FSNR",
    level: "Masters Degree"
  },
  {
    programmeId: "FSNR-MSUSLTI",
    name: "Master of Science in Ugandan Sign Language Translation and Interpreting",
    departmentId: "FSNR-HSLIS",
    facultyId: "FSNR",
    level: "Masters Degree"
  },
  {
    programmeId: "FSNR-MCDLL",
    name: "Master of Community Development and Lifelong Learning",
    departmentId: "FSNR-ACOLL",
    facultyId: "FSNR",
    level: "Masters Degree"
  },
  {
    programmeId: "FSNR-PGD-SNE",
    name: "Postgraduate Diploma in Special Needs Education",
    departmentId: "FSNR-IDDS",
    facultyId: "FSNR",
    level: "Postgraduate Diploma"
  },
  {
    programmeId: "FSNR-PGD-CBR",
    name: "Postgraduate Diploma in Community-Based Rehabilitation",
    departmentId: "FSNR-CDS",
    facultyId: "FSNR",
    level: "Postgraduate Diploma"
  },
  {
    programmeId: "FSNR-PGD-CDLL",
    name: "Postgraduate Diploma in Community Development and Lifelong Learning",
    departmentId: "FSNR-ACOLL",
    facultyId: "FSNR",
    level: "Postgraduate Diploma"
  },

  // Institute of Distance Education, e-Learning
  {
    programmeId: "IDAEL-BED-ODEL",
    name: "Bachelor of Education (ODeL)",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "Distance Degree"
  },
  {
    programmeId: "IDAEL-BED-SCI",
    name: "Bachelor of Education (Science) (ODeL)",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "Distance Degree"
  },
  {
    programmeId: "IDAEL-BESE",
    name: "Bachelor of Education Secondary - External",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "External Degree"
  },
  {
    programmeId: "IDAEL-BSNEE",
    name: "Bachelor of Education Special Needs Education - External",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "External Degree"
  },
  {
    programmeId: "IDAEL-BEPE",
    name: "Bachelor of Education Primary - External",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "External Degree"
  },
  {
    programmeId: "IDAEL-DEPE",
    name: "Diploma in Education Primary - External",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "External Diploma"
  },
  {
    programmeId: "IDAEL-DSNEE",
    name: "Diploma in Special Needs Education - External",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "External Diploma"
  },
  {
    programmeId: "IDAEL-DEP",
    name: "Diploma in Education Primary",
    departmentId: "IDAEL-CDE",
    facultyId: "IDAEL",
    level: "Diploma"
  }
];

export const campusOffices = [];

// Populate from departments
departments.forEach(dept => {
  const bldg = getBuildingById(dept.buildingId);
  const fac = faculties.find(f => f.facultyId === dept.facultyId);
  const lat = bldg ? bldg.latitude : 0.3476;
  const lng = bldg ? bldg.longitude : 32.6316;
  const bldgName = bldg ? bldg.name : "Kyambogo Department Block";

  // 1. Head of Department Office
  campusOffices.push({
    officeId: `OFFICE-HOD-${dept.departmentId}`,
    title: `Head of Department Office – ${dept.name}`,
    role: 'hod',
    officerName: dept.hodName,
    facultyId: dept.facultyId,
    departmentId: dept.departmentId,
    buildingId: dept.buildingId,
    buildingName: bldgName,
    floor: dept.hodOfficeFloor,
    room: dept.hodOfficeRoom,
    officeHours: dept.officeHours,
    email: dept.contactEmail,
    phone: fac?.contactPhone,
    latitude: lat,
    longitude: lng,
    servicesProvided: [
      "Academic approvals & course coordination",
      "Department head consultations & petitions",
      "Examinations & grading inquiries",
      "Timetable and lecture scheduling"
    ]
  });

  // 2. Department Staff Offices
  campusOffices.push({
    officeId: `OFFICE-STAFF-${dept.departmentId}`,
    title: `Department Staff & Lecturers Office – ${dept.name}`,
    role: 'staff',
    officerName: `Lecturers & Academic Staff (${dept.name})`,
    facultyId: dept.facultyId,
    departmentId: dept.departmentId,
    buildingId: dept.buildingId,
    buildingName: bldgName,
    floor: dept.staffOfficeFloor,
    room: dept.staffOfficeRoom,
    officeHours: "Monday – Friday, 9:00 AM – 4:00 PM",
    email: dept.contactEmail,
    phone: fac?.contactPhone,
    latitude: lat,
    longitude: lng,
    servicesProvided: [
      "Student coursework consultations",
      "Tutorials and project supervision",
      "Internship & field attachment guidance"
    ]
  });
});

// Dean Offices
faculties.forEach(fac => {
  const bldg = getBuildingById(fac.buildingId);
  const lat = bldg ? bldg.latitude : 0.3476;
  const lng = bldg ? bldg.longitude : 32.6316;
  const bldgName = bldg ? bldg.name : "Faculty Dean Complex";

  campusOffices.push({
    officeId: `OFFICE-DEAN-${fac.facultyId}`,
    title: `Dean's Office – ${fac.name}`,
    role: 'dean',
    officerName: fac.deanName,
    facultyId: fac.facultyId,
    buildingId: fac.buildingId,
    buildingName: bldgName,
    floor: fac.deanOfficeFloor,
    room: fac.deanOfficeRoom,
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM",
    email: fac.contactEmail,
    phone: fac.contactPhone,
    latitude: lat,
    longitude: lng,
    servicesProvided: [
      "Faculty leadership and academic oversight",
      "Inter-faculty transfers & approvals",
      "Graduation clearance and honors",
      "Official academic recommendations"
    ]
  });
});

// Central Administration
const centralAdminOffices = [
  {
    officeId: "OFFICE-ACADEMIC-REGISTRAR",
    title: "Office of the Academic Registrar",
    role: 'administration',
    officerName: "Dr. Annie Begumisa (Academic Registrar)",
    buildingId: "ADMISSIONS-BLOCK",
    buildingName: "Admissions Block & Academic Registrar",
    floor: "1st Floor",
    room: "Room AR-101",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM",
    email: "ar@kyu.ac.ug",
    phone: "+256 414 285 037",
    latitude: 0.349850,
    longitude: 32.631720,
    servicesProvided: [
      "Admissions and registration of new students",
      "Academic transcripts and degree certificates",
      "Identity cards and student verification",
      "Semester examinations and result appeals"
    ]
  },
  {
    officeId: "OFFICE-UNDERGRADUATE-ADMISSIONS",
    title: "Undergraduate Admissions Office",
    role: 'administration',
    officerName: "Senior Assistant Registrar (Admissions)",
    buildingId: "ADMISSIONS-BLOCK",
    buildingName: "Admissions Block & Academic Registrar",
    floor: "Ground Floor",
    room: "Room ADM-04",
    officeHours: "Monday – Friday, 8:00 AM – 4:30 PM",
    email: "admissions@kyu.ac.ug",
    phone: "+256 414 285 038",
    latitude: 0.349850,
    longitude: 32.631720,
    servicesProvided: [
      "Direct entry, diploma entry, mature age entry",
      "Change of programmes",
      "Admission letters collection"
    ]
  },
  {
    officeId: "OFFICE-VICE-CHANCELLOR",
    title: "Office of the Vice Chancellor",
    role: 'administration',
    officerName: "Prof. Eli Katunguka-Rwakishaya (Vice Chancellor)",
    buildingId: "KYAMBOGO-COLLEGE-ADMIN",
    buildingName: "Main Administration Block",
    floor: "2nd Floor",
    room: "Room VC-201",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM",
    email: "vc@kyu.ac.ug",
    phone: "+256 414 286 237",
    latitude: 0.350130,
    longitude: 32.632900,
    servicesProvided: [
      "University executive leadership and governance",
      "Official institutional inquiries",
      "International partnerships and visits"
    ]
  },
  {
    officeId: "OFFICE-DEAN-OF-STUDENTS",
    title: "Office of the Dean of Students",
    role: 'administration',
    officerName: "Mildred Tuhaise (Dean of Students)",
    buildingId: "STUDENT-CENTER",
    buildingName: "Student Center & Guild Canteen",
    floor: "1st Floor",
    room: "Room DOS-102",
    officeHours: "Monday – Friday, 8:00 AM – 5:00 PM",
    email: "dos@kyu.ac.ug",
    phone: "+256 414 285 004",
    latitude: 0.347350,
    longitude: 32.630450,
    servicesProvided: [
      "Halls of residence allocation & accommodation",
      "Student welfare, health and counselling",
      "Clubs, sports and Guild affairs"
    ]
  }
];

campusOffices.push(...centralAdminOffices);

export const destinations = [
  {
    destinationId: "DEST-FOE-CIVIL-OFFICE",
    name: "Civil Engineering Department Office & HOD",
    type: "department-office",
    facultyId: "FOE",
    departmentId: "FOE-CIVIL",
    buildingId: "CIVIL-LECTURE-ROOMS",
    latitude: 0.348570,
    longitude: 32.629320,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room C-102",
      head: "Eng. Dr. Michael Kigozi",
      contact: "hod.civil@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FOE-MECH-OFFICE",
    name: "Mechanical Engineering Department Office & HOD",
    type: "department-office",
    facultyId: "FOE",
    departmentId: "FOE-MECHANICAL",
    buildingId: "MECHANICAL-BLOCK",
    latitude: 0.348220,
    longitude: 32.626950,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Room M-110",
      head: "Dr. Joseph Byaruhanga",
      contact: "hod.mechanical@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FOE-ELEC-OFFICE",
    name: "Electrical Engineering Department Office & HOD",
    type: "department-office",
    facultyId: "FOE",
    departmentId: "FOE-ELECTRICAL",
    buildingId: "FACULTY-SCIENCE-ENGINEERING",
    latitude: 0.348700,
    longitude: 32.626460,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room EE-104",
      head: "Dr. Emmanuel Wokorach",
      contact: "hod.electrical@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FOE-BIOMED-OFFICE",
    name: "Biomedical Engineering Department Office & HOD",
    type: "department-office",
    facultyId: "FOE",
    departmentId: "FOE-BIOMEDICAL",
    buildingId: "ENGINEERING-LABORATORIES",
    latitude: 0.349050,
    longitude: 32.626050,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room BM-201",
      head: "Dr. Ronald Kayiwa",
      contact: "hod.biomedical@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FOE-MINING-OFFICE",
    name: "Mining Engineering Department Office & HOD",
    type: "department-office",
    facultyId: "FOE",
    departmentId: "FOE-MINING",
    buildingId: "LANDS-LECTURE-ROOMS",
    latitude: 0.349140,
    longitude: 32.629150,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room MP-102",
      head: "Dr. Peter Lating",
      contact: "hod.mining@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FOED-TEE-OFFICE",
    name: "Teacher Education Department Office & HOD",
    type: "department-office",
    facultyId: "FOED",
    departmentId: "FOED-TEE",
    buildingId: "FACULTY-EDUCATION",
    latitude: 0.349290,
    longitude: 32.626710,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room ED-104",
      head: "Dr. Mary Goretti Nakabugo",
      contact: "hod.tee@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FOED-EPM-OFFICE",
    name: "Educational Planning & Management Department Office & HOD",
    type: "department-office",
    facultyId: "FOED",
    departmentId: "FOED-EPM",
    buildingId: "FACULTY-EDUCATION",
    latitude: 0.349290,
    longitude: 32.626710,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "3rd Floor",
      room: "Room ED-302",
      head: "Dr. David Onen",
      contact: "hod.epm@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SAID-FA-OFFICE",
    name: "Fine Art Department Office & HOD",
    type: "department-office",
    facultyId: "SAID",
    departmentId: "SAID-FA",
    buildingId: "ART-DESIGN-BLOCK-29",
    latitude: 0.347625,
    longitude: 32.633625,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Room SA-12",
      head: "Mr. Godfrey Banadda",
      contact: "hod.fineart@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOME-AF-OFFICE",
    name: "Accounting and Finance Department Office & HOD",
    type: "department-office",
    facultyId: "SOME",
    departmentId: "SOME-AF",
    buildingId: "SOME-BLOCK",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room MB-201 (NPT)",
      head: "Dr. Stephen Nkundabanyanga",
      contact: "hod.accounting@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOME-BAE-OFFICE",
    name: "Business Administration Department Office & HOD",
    type: "department-office",
    facultyId: "SOME",
    departmentId: "SOME-BAE",
    buildingId: "SOME-BLOCK",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room MB-108 (NPT)",
      head: "Dr. Fredrick Nsubuga",
      contact: "hod.bae@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOME-MS-OFFICE",
    name: "Management Science Department Office & HOD",
    type: "department-office",
    facultyId: "SOME",
    departmentId: "SOME-MS",
    buildingId: "SOME-BLOCK",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "3rd Floor",
      room: "Room MB-301 (NPT)",
      head: "Dr. Benon Basheka",
      contact: "hod.mgtsci@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOME-PM-OFFICE",
    name: "Procurement & Logistics Department Office & HOD",
    type: "department-office",
    facultyId: "SOME",
    departmentId: "SOME-PM",
    buildingId: "SOME-BLOCK",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room MB-210 (NPT)",
      head: "Dr. Sarah Eyaa",
      contact: "hod.procurement@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOME-ECON-OFFICE",
    name: "Department of Economics Office & HOD",
    type: "department-office",
    facultyId: "SOME",
    departmentId: "SOME-ECON",
    buildingId: "SOME-BLOCK",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room MB-218 (Economics)",
      head: "Dr. Eria Hisali",
      contact: "hod.economics@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOME-ECON-STAFF",
    name: "Department of Economics Lecturers Staff Room",
    type: "staff-office",
    facultyId: "SOME",
    departmentId: "SOME-ECON",
    buildingId: "SOME-BLOCK",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room MB-220 (Economics Staff)",
      head: "Dr. Eria Hisali",
      contact: "hod.economics@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SBE-ARCH-OFFICE",
    name: "Architecture Department Office & HOD",
    type: "department-office",
    facultyId: "SBE",
    departmentId: "SBE-ARCH",
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    latitude: 0.355520,
    longitude: 32.625270,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room SBE-102",
      head: "Arch. Kenneth Ssemwogerere",
      contact: "hod.architecture@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SBE-QSPV-OFFICE",
    name: "Quantity Surveying Department Office & HOD",
    type: "department-office",
    facultyId: "SBE",
    departmentId: "SBE-QSPV",
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    latitude: 0.355520,
    longitude: 32.625270,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room SBE-202",
      head: "Surv. Moses Musinguzi",
      contact: "hod.qspv@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SBE-GEO-OFFICE",
    name: "Geospatial and Land Information Department Office & HOD",
    type: "department-office",
    facultyId: "SBE",
    departmentId: "SBE-GEO",
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    latitude: 0.355520,
    longitude: 32.625270,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room SBE-212",
      head: "Dr. Ronald Ssengendo",
      contact: "hod.geoinformatics@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SCIS-CS-OFFICE",
    name: "HOD Bachelor of Information Technology & Computing (BITC)",
    type: "department-office",
    facultyId: "SCIS",
    departmentId: "SCIS-CS",
    buildingId: "FACULTY-SCIENCE-ENGINEERING",
    latitude: 0.348704,
    longitude: 32.62646,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Engineering Complex Wing B, Room EC-108",
      head: "Dr. Jude Lubega",
      contact: "hod.cs@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SCIS-LIS-OFFICE",
    name: "HOD Bachelor of Library & Information Science (BLIS)",
    type: "department-office",
    facultyId: "SCIS",
    departmentId: "SCIS-LIS",
    buildingId: "CENTRAL-LIBRARY",
    latitude: 0.350817,
    longitude: 32.63086,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Central Library 1st Floor (ICT & LIS Wing)",
      head: "Dr. Prisca Tibenderana",
      contact: "hod.lis@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-AGR-DEPT-OFFICE",
    name: "Department of Agriculture & Animal Production HOD Office",
    type: "department-office",
    facultyId: "FOA",
    departmentId: "AGR-DEPT",
    buildingId: "FACULTY-AGRICULTURE",
    latitude: 0.345820,
    longitude: 32.634850,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room AG-102 (Faculty of Agriculture Complex)",
      head: "Dr. Florence Kiwumulo",
      contact: "hod.agriculture@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOVS-FLCS-OFFICE",
    name: "Family and Life Consumer Studies Department Office & HOD",
    type: "department-office",
    facultyId: "SOVS",
    departmentId: "SOVS-FLCS",
    buildingId: "SOVS-BLOCK",
    latitude: 0.349800,
    longitude: 32.627500,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room VS-202",
      head: "Dr. Harriet Nabushawo",
      contact: "hod.flcs@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOVS-NSD-OFFICE",
    name: "Nutrition and Dietetics Department Office & HOD",
    type: "department-office",
    facultyId: "SOVS",
    departmentId: "SOVS-NSD",
    buildingId: "SOVS-BLOCK",
    latitude: 0.349800,
    longitude: 32.627500,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room VS-208",
      head: "Dr. Robert Mwadime",
      contact: "hod.nutrition@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOVS-HIC-OFFICE",
    name: "Hotel and Institutional Catering Department Office & HOD",
    type: "department-office",
    facultyId: "SOVS",
    departmentId: "SOVS-HIC",
    buildingId: "SOVS-BLOCK",
    latitude: 0.349800,
    longitude: 32.627500,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room VS-105",
      head: "Mrs. Teddy Nabatanzi",
      contact: "hod.catering@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SOVS-CF-OFFICE",
    name: "Clothing and Fashion Department Office & HOD",
    type: "department-office",
    facultyId: "SOVS",
    departmentId: "SOVS-CF",
    buildingId: "SOVS-BLOCK",
    latitude: 0.349800,
    longitude: 32.627500,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room VS-112",
      head: "Ms. Juliet Babirye",
      contact: "hod.fashion@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FSNR-CDS-OFFICE",
    name: "Community-Based Rehabilitation Department Office & HOD",
    type: "department-office",
    facultyId: "FSNR",
    departmentId: "FSNR-CDS",
    buildingId: "FSNR-BLOCK",
    latitude: 0.353800,
    longitude: 32.626100,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Room SN-104",
      head: "Dr. Alice Wabule",
      contact: "hod.rehab@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FSNR-HSLIS-OFFICE",
    name: "Sign Language Interpreting Department Office & HOD",
    type: "department-office",
    facultyId: "FSNR",
    departmentId: "FSNR-HSLIS",
    buildingId: "FSNR-BLOCK",
    latitude: 0.353800,
    longitude: 32.626100,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room SN-201",
      head: "Dr. Sam Lutalo-Kiingi",
      contact: "hod.signlanguage@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-ENGINEERING-DEAN",
    name: "Dean's Office – Faculty of Engineering",
    type: "deans_office",
    facultyId: "FOE",
    departmentId: null,
    buildingId: "FACULTY-SCIENCE-ENGINEERING",
    latitude: 0.348700,
    longitude: 32.626460,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room FE-201",
      head: "Dr. Catherine Wandera",
      contact: "dean.engineering@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-AGRICULTURE-DEAN",
    name: "Dean's Office – Faculty of Agriculture and Animal Sciences",
    type: "deans_office",
    facultyId: "FOA",
    departmentId: null,
    buildingId: "FACULTY-AGRICULTURE",
    latitude: 0.345820,
    longitude: 32.634850,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room AG-201",
      head: "Assoc. Prof. Joseph Ssennyonga",
      contact: "dean.agriculture@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-EDUCATION-DEAN",
    name: "Dean's Office – Faculty of Education",
    type: "deans_office",
    facultyId: "FOED",
    departmentId: null,
    buildingId: "FACULTY-EDUCATION",
    latitude: 0.349290,
    longitude: 32.626710,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room ED-101",
      head: "Assoc. Prof. Joyce Ayikoru",
      contact: "dean.education@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-COMPUTING-DEAN",
    name: "Dean's Office – School of Computing & Information Science",
    type: "deans_office",
    facultyId: "SCIS",
    departmentId: null,
    buildingId: "SCIS-BLOCK",
    latitude: 0.349450,
    longitude: 32.630120,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "3rd Floor",
      room: "Room CS-301",
      head: "Dr. John B. Ngubiri",
      contact: "dean.computing@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-MANAGEMENT-DEAN",
    name: "Dean's Office – School of Management & Entrepreneurship",
    type: "deans_office",
    facultyId: "SOME",
    departmentId: null,
    buildingId: "SOME-BLOCK",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "2nd Floor",
      room: "Room MB-205 (NPT Complex)",
      head: "Dr. Regis Namuddu",
      contact: "dean.management@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-BUILT-ENV-DEAN",
    name: "Dean's Office – School of Built Environment",
    type: "deans_office",
    facultyId: "SBE",
    departmentId: null,
    buildingId: "SCHOOL-BUILT-ENVIRONMENT",
    latitude: 0.355520,
    longitude: 32.625270,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room SBE-105",
      head: "Dr. Anthony Gidudu",
      contact: "dean.builtenvironment@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-SPECIAL-NEEDS-DEAN",
    name: "Dean's Office – Faculty of Special Needs & Rehabilitation",
    type: "deans_office",
    facultyId: "FSNR",
    departmentId: null,
    buildingId: "FSNR-BLOCK",
    latitude: 0.353800,
    longitude: 32.626100,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Room SN-101",
      head: "Dr. Patrick Ojok",
      contact: "dean.specialneeds@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-ART-DESIGN-DEAN",
    name: "Dean's Office – School of Art & Industrial Design (SAID)",
    type: "deans_office",
    facultyId: "SAID",
    departmentId: null,
    buildingId: "ART-DESIGN-BLOCK-29",
    latitude: 0.347625,
    longitude: 32.633625,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Room SA-10",
      head: "Dr. Emmanuel Mutungi",
      contact: "dean.said@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-ACADEMIC-REGISTRAR",
    name: "Academic Registrar & Admissions Complex",
    type: "administration",
    facultyId: null,
    departmentId: null,
    buildingId: "ADMISSIONS-BLOCK",
    latitude: 0.347977,
    longitude: 32.631923,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Room AR-101",
      head: "Dr. Annie Begumisa",
      contact: "ar@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-CENTRAL-LIBRARY",
    name: "Kyambogo Central University Library",
    type: "library",
    facultyId: null,
    departmentId: null,
    buildingId: "CENTRAL-LIBRARY",
    latitude: 0.350658,
    longitude: 32.630803,
    coordinateStatus: "verified"
  },
  {
    destinationId: "DEST-CENTRAL-TEACHING-FACILITY",
    name: "Central Teaching Facility (CTF Auditorium & Lecture Halls)",
    type: "teaching-facility",
    facultyId: null,
    departmentId: null,
    buildingId: "CENTRAL-TEACHING-FACILITY",
    latitude: 0.349240,
    longitude: 32.630640,
    coordinateStatus: "verified"
  },
  {
    destinationId: "DEST-NPT-BUILDING",
    name: "NPT Building",
    type: "academic",
    facultyId: "FOED",
    departmentId: null,
    buildingId: "NPT-BUILDING",
    latitude: 0.346647,
    longitude: 32.631197,
    coordinateStatus: "verified"
  },
  {
    destinationId: "DEST-RAC-BUILDING",
    name: "RAC Building (Refrigeration & Air Conditioning)",
    type: "laboratory",
    facultyId: "FOE",
    departmentId: "FOE-MECHANICAL",
    buildingId: "RAC-BUILDING",
    latitude: 0.346571,
    longitude: 32.631605,
    coordinateStatus: "verified"
  },
  {
    destinationId: "DEST-LANGUAGES-DEPT",
    name: "Department of Languages and Communication Office",
    type: "department-office",
    facultyId: "FAS",
    departmentId: "FAS-LANGUAGES",
    buildingId: "DEPT-LANGUAGES-BUILDING",
    latitude: 0.348878,
    longitude: 32.631508,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Languages Department Office",
      head: "Head of Department (Languages & Communication)",
      contact: "languages@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-KYU-POLICE",
    name: "Kyambogo University Police Station & Security",
    type: "police",
    facultyId: null,
    departmentId: null,
    buildingId: "KYAMBOGO-POLICE-POST",
    latitude: 0.350176,
    longitude: 32.626101,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Police Reception & Duty Desk",
      head: "Officer in Charge (OC Kyambogo Police Post)",
      contact: "security@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-FAH-MDD-OFFICE",
    name: "Department of Performing Arts (Music, Dance and Drama)",
    type: "academic",
    facultyId: "FAH",
    departmentId: "FAH-MDD",
    buildingId: "DEPT-PERFORMING-ARTS-MDD",
    latitude: 0.347614,
    longitude: 32.631102,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "Ground Floor",
      room: "Music Centre Office 01",
      head: "Dr. Benon Kigozi",
      contact: "hod.performingarts@kyu.ac.ug"
    }
  },
  {
    destinationId: "DEST-ARTS-DEAN",
    name: "Dean's Office – Faculty of Arts and Humanities",
    type: "deans_office",
    facultyId: "FAH",
    departmentId: null,
    buildingId: "FACULTY-ARTS",
    latitude: 0.347845,
    longitude: 32.631411,
    coordinateStatus: "verified",
    officeDetails: {
      floor: "1st Floor",
      room: "Dean's Suite, Room A-101",
      head: "Assoc. Prof. Dr. Robert Ojambo",
      contact: "dean.arts@kyu.ac.ug"
    }
  }
];

// Health check
app.get(["/api", "/api/health", "/health"], (req, res) => {
  res.json({ status: "ok", name: "Kyambogo Digital Campus Map API", version: "2.0.0" });
});

// 1. Buildings API
app.get(["/api/buildings", "/buildings"], async (req, res) => {
  try {
    const dbBuildings = await safeMongoQuery(mongoDb ? mongoDb.collection("buildings").find().toArray() : null, null);
    if (Array.isArray(dbBuildings) && dbBuildings.length > 0) {
      return res.json(dbBuildings);
    }
  } catch (e) {
    console.warn("MongoDB buildings fallback:", e.message);
  }
  res.json(buildings);
});

// 2. Destinations API
app.get(["/api/destinations", "/destinations"], async (req, res) => {
  try {
    const departmentId = req.query.departmentId;
    const facultyId = req.query.facultyId;
    const type = req.query.type;

    let sourceDestinations = destinations;
    const dbDestinations = await safeMongoQuery(mongoDb ? mongoDb.collection("destinations").find().toArray() : null, null);
    if (Array.isArray(dbDestinations) && dbDestinations.length > 0) {
      const dbDestIds = new Set(dbDestinations.map(d => d.destinationId));
      const missingDest = destinations.filter(d => !dbDestIds.has(d.destinationId));
      sourceDestinations = [...dbDestinations, ...missingDest];
    }

    let filtered = Array.isArray(sourceDestinations) ? sourceDestinations : destinations;
    if (departmentId) filtered = filtered.filter(d => d.departmentId === departmentId);
    if (facultyId) filtered = filtered.filter(d => d.facultyId === facultyId);
    if (type) filtered = filtered.filter(d => d.type === type);

    const results = filtered.map(d => {
      const bldg = getBuildingById(d.buildingId);
      return {
        ...d,
        latitude: d.latitude || (bldg ? bldg.latitude : undefined),
        longitude: d.longitude || (bldg ? bldg.longitude : undefined),
        buildingName: bldg?.name
      };
    });

    res.json(results);
  } catch (err) {
    console.warn("Destinations fallback:", err.message);
    res.json(destinations);
  }
});

// 3. Faculties API
app.get(["/api/faculties", "/faculties"], async (req, res) => {
  try {
    let sourceFaculties = faculties;
    const dbFacs = await safeMongoQuery(mongoDb ? mongoDb.collection("faculties").find().toArray() : null, null);
    if (Array.isArray(dbFacs) && dbFacs.length > 0) sourceFaculties = dbFacs;

    const results = (Array.isArray(sourceFaculties) ? sourceFaculties : faculties).map(f => {
      const bldg = getBuildingById(f.buildingId);
      return {
        ...f,
        building: bldg,
        latitude: bldg?.latitude,
        longitude: bldg?.longitude
      };
    });
    res.json(results);
  } catch (err) {
    res.json(faculties);
  }
});

// 4. Departments API
app.get(["/api/departments", "/departments"], async (req, res) => {
  try {
    const facultyId = req.query.facultyId;
    let sourceDepartments = departments;
    const dbDepts = await safeMongoQuery(mongoDb ? mongoDb.collection("departments").find().toArray() : null, null);
    if (Array.isArray(dbDepts) && dbDepts.length > 0) sourceDepartments = dbDepts;

    let results = Array.isArray(sourceDepartments) ? sourceDepartments : departments;
    if (facultyId) {
      results = results.filter(d => d.facultyId === facultyId);
    }

    const enriched = results.map(d => {
      const bldg = getBuildingById(d.buildingId);
      const faculty = faculties.find(f => f.facultyId === d.facultyId);
      return {
        ...d,
        building: bldg,
        facultyName: faculty?.name,
        latitude: bldg?.latitude,
        longitude: bldg?.longitude
      };
    });

    res.json(enriched);
  } catch (err) {
    res.json(departments);
  }
});

// 5. All Departments API
app.get(["/api/all-departments", "/all-departments"], async (req, res) => {
  try {
    let sourceDepartments = departments;
    const dbDepts = await safeMongoQuery(mongoDb ? mongoDb.collection("departments").find().toArray() : null, null);
    if (Array.isArray(dbDepts) && dbDepts.length > 0) sourceDepartments = dbDepts;
    res.json(Array.isArray(sourceDepartments) ? sourceDepartments : departments);
  } catch (err) {
    res.json(departments);
  }
});

// 6. Programmes API
app.get("/api/programmes", async (req, res) => {
  const search = (req.query.search || '').trim().toLowerCase();

  let sourceProgrammes = programmes;
  if (mongoDb) {
    try {
      const dbProgs = await mongoDb.collection("programmes").find().toArray();
      if (dbProgs.length > 0) sourceProgrammes = dbProgs;
    } catch (e) {}
  }

  let results = sourceProgrammes;
  if (search) {
    results = results.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.programmeId.toLowerCase().includes(search)
    );
  }

  const enriched = results.map(p => {
    const dept = departments.find(d => d.departmentId === p.departmentId);
    const faculty = faculties.find(f => f.facultyId === p.facultyId);
    const bldg = dept ? getBuildingById(dept.buildingId) : undefined;
    return {
      ...p,
      departmentName: dept?.name,
      facultyName: faculty?.name,
      buildingName: bldg?.name,
      latitude: bldg?.latitude,
      longitude: bldg?.longitude
    };
  });

  res.json(enriched);
});

// 7. Offices API (Staff Offices, Department Heads, Deans)
app.get("/api/offices", async (req, res) => {
  const search = (req.query.search || '').trim().toLowerCase();
  const departmentId = req.query.departmentId;
  const facultyId = req.query.facultyId;
  const role = req.query.role;

  let sourceOffices = campusOffices;
  if (mongoDb) {
    try {
      const dbOffices = await mongoDb.collection("offices").find().toArray();
      if (dbOffices.length > 0) sourceOffices = dbOffices;
    } catch (e) {}
  }

  let results = sourceOffices;

  if (departmentId) {
    results = results.filter(o => o.departmentId === departmentId);
  }
  if (facultyId) {
    results = results.filter(o => o.facultyId === facultyId);
  }
  if (role) {
    results = results.filter(o => o.role === role);
  }
  if (search) {
    results = results.filter(o =>
      o.title.toLowerCase().includes(search) ||
      o.officerName.toLowerCase().includes(search) ||
      o.room.toLowerCase().includes(search) ||
      o.buildingName.toLowerCase().includes(search)
    );
  }

  res.json(results);
});

// 8. Programme Destination & Complete Office Information
app.get("/api/programmes/:programmeId/destination", (req, res) => {
  const programmeId = req.params.programmeId;
  const programme = programmes.find(p => p.programmeId === programmeId);

  if (!programme) {
    return res.status(404).json({ message: "Programme not found" });
  }

  const department = departments.find(d => d.departmentId === programme.departmentId);
  const faculty = faculties.find(f => f.facultyId === programme.facultyId);

  let destination = destinations.find(d => d.departmentId === programme.departmentId);
  let building;

  if (destination) {
    building = getBuildingById(destination.buildingId);
  } else if (department) {
    building = getBuildingById(department.buildingId);
  } else if (faculty) {
    building = getBuildingById(faculty.buildingId);
  }

  const relatedOffices = campusOffices.filter(o =>
    (programme.departmentId && o.departmentId === programme.departmentId) ||
    (programme.facultyId && o.facultyId === programme.facultyId && o.role === 'dean')
  );

  const hodOffice = relatedOffices.find(o => o.role === 'hod');
  const deanOffice = relatedOffices.find(o => o.role === 'dean');
  const staffOffice = relatedOffices.find(o => o.role === 'staff');

  res.json({
    programme,
    department: department ? {
      ...department,
      building: department ? getBuildingById(department.buildingId) : undefined
    } : null,
    faculty: faculty ? {
      ...faculty,
      building: faculty ? getBuildingById(faculty.buildingId) : undefined
    } : null,
    destination: destination || (building ? {
      destinationId: `DEST-${department?.departmentId || faculty?.facultyId}`,
      name: `${department?.name || faculty?.name} Office`,
      type: "department-office",
      facultyId: programme.facultyId,
      departmentId: programme.departmentId,
      buildingId: building.buildingId,
      latitude: building.latitude,
      longitude: building.longitude
    } : null),
    building: building || null,
    offices: {
      hodOffice,
      deanOffice,
      staffOffice,
      allOffices: relatedOffices
    }
  });
});

// 9. Comprehensive Search API
app.get("/api/search", (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();

  if (!query) {
    return res.json({
      programmes: [],
      departments: [],
      faculties: [],
      offices: [],
      buildings: []
    });
  }

  const matchedProgrammes = programmes
    .filter(p => p.name.toLowerCase().includes(query) || p.programmeId.toLowerCase().includes(query))
    .slice(0, 10)
    .map(p => {
      const dept = departments.find(d => d.departmentId === p.departmentId);
      const bldg = dept ? getBuildingById(dept.buildingId) : undefined;
      return {
        ...p,
        departmentName: dept?.name,
        buildingName: bldg?.name,
        lat: bldg?.latitude,
        lng: bldg?.longitude
      };
    });

  const matchedDepartments = departments
    .filter(d => d.name.toLowerCase().includes(query) || d.departmentId.toLowerCase().includes(query))
    .slice(0, 10)
    .map(d => {
      const bldg = getBuildingById(d.buildingId);
      const fac = faculties.find(f => f.facultyId === d.facultyId);
      return {
        ...d,
        buildingName: bldg?.name,
        facultyName: fac?.name,
        lat: bldg?.latitude,
        lng: bldg?.longitude
      };
    });

  const isAdmissSearch = query.includes('admiss') || query.includes('adnisi') || query.includes('apply') || query.includes('intake') || query.includes('join');

  const matchedFaculties = faculties
    .filter(f => isAdmissSearch || f.name.toLowerCase().includes(query) || f.shortName.toLowerCase().includes(query) || f.facultyId.toLowerCase().includes(query))
    .slice(0, 8)
    .map(f => {
      const bldg = getBuildingById(f.buildingId);
      return {
        ...f,
        admissionsNotice: "Report directly to Faculty Head / Dean for admissions clearance",
        buildingName: bldg?.name,
        lat: bldg?.latitude,
        lng: bldg?.longitude
      };
    });

  const matchedOffices = campusOffices
    .filter(o =>
      (isAdmissSearch && o.role === 'dean') ||
      o.title.toLowerCase().includes(query) ||
      o.officerName.toLowerCase().includes(query) ||
      o.room.toLowerCase().includes(query) ||
      o.buildingName.toLowerCase().includes(query) ||
      (query.includes('hod') && o.role === 'hod') ||
      (query.includes('dean') && o.role === 'dean') ||
      (query.includes('staff') && o.role === 'staff')
    )
    .slice(0, 10)
    .map(o => ({
      ...o,
      lat: o.latitude,
      lng: o.longitude
    }));

  const matchedBuildings = buildings
    .filter(b => {
      // If searching admissions, suppress Senate / Admissions Block from dominating and show faculty buildings
      if (isAdmissSearch && (b.buildingId === 'SENATE-BUILDING' || b.buildingId === 'ADMISSIONS-BLOCK')) {
        return false;
      }
      return b.name.toLowerCase().includes(query) || (b.description && b.description.toLowerCase().includes(query));
    })
    .slice(0, 10)
    .map(b => ({
      ...b,
      lat: b.latitude,
      lng: b.longitude
    }));

  const matchedEvents = events
    .filter(e => isEventUpcoming(e) && (
      e.title.toLowerCase().includes(query) ||
      e.description.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query) ||
      e.buildingName.toLowerCase().includes(query) ||
      e.organizer.toLowerCase().includes(query)
    ))
    .slice(0, 5)
    .map(e => ({
      ...e,
      lat: e.latitude,
      lng: e.longitude
    }));

  res.json({
    programmes: matchedProgrammes,
    departments: matchedDepartments,
    faculties: matchedFaculties,
    offices: matchedOffices,
    buildings: matchedBuildings,
    events: matchedEvents
  });
});

// 10. Users API
app.post("/api/users", (req, res) => {
  const { name, email } = req.body;
  res.json({
    message: "User saved successfully!",
    userId: "user_" + Math.random().toString(36).substring(2, 9),
    user: { name, email, createdAt: new Date() }
  });
});

// 11. Database Status & Manual Seed Trigger API
app.get("/api/db/status", (req, res) => {
  res.json({
    connected: mongoDb !== null,
    hasMongoUri: !!process.env.MONGODB_URI,
    databaseName: process.env.MONGODB_DB_NAME || "kyambiDM",
    totalBuildings: buildings.length,
    totalFaculties: faculties.length,
    totalDepartments: departments.length,
    totalProgrammes: programmes.length,
    totalDestinations: destinations.length,
    totalOffices: campusOffices.length,
    totalEvents: events.length
  });
});

// 12. Campus Events API (Upcoming Events, Admin Approval Queue, Filter by Building or Category)
const ADMIN_PASSCODE = process.env.ADMIN_KEY || "kyuAdmin2026";

// Helper to verify that an event deadline or end date has not passed
function isEventUpcoming(e) {
  if (!e) return false;
  // Today in Kampala/EAT (UTC+3)
  const now = new Date();
  const todayStr = new Date(now.getTime() + (3 * 60 * 60 * 1000)).toISOString().split("T")[0];
  const deadline = e.endDate || e.startDate || e.date;
  if (!deadline) return true;
  return String(deadline).substring(0, 10) >= todayStr;
}

// Load cached synced events from synced-campus-events.json if available
let cachedSyncedEvents = [];
try {
  const syncedFile = path.join(__dirname, 'synced-campus-events.json');
  if (fs.existsSync(syncedFile)) {
    const raw = fs.readFileSync(syncedFile, 'utf8');
    cachedSyncedEvents = JSON.parse(raw);
  }
} catch (e) {
  console.warn("Notice: could not load synced-campus-events.json:", e.message);
}

// Helper to uniquely identify duplicate events by normalized title and date
function getEventKey(e) {
  if (!e) return "";
  const title = (e.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const date = (e.startDate || e.date || "").substring(0, 10);
  return `${title}_${date}`;
}

// Merge and auto-prune past events immediately (strictly deduplicated)
const initialEventsMap = new Map();
cachedSyncedEvents.forEach(e => {
  if (isEventUpcoming(e)) {
    const k = getEventKey(e);
    if (k) initialEventsMap.set(k, e);
  }
});
campusEvents.forEach(e => {
  if (isEventUpcoming(e)) {
    const k = getEventKey(e);
    if (k && !initialEventsMap.has(k)) {
      initialEventsMap.set(k, e);
    }
  }
});

let events = Array.from(initialEventsMap.values());
let pendingEvents = [];

// Automatic Deletion Function: permanently deletes past events & updates JSON cache
function pruneExpiredEvents() {
  const now = new Date();
  const todayStr = new Date(now.getTime() + (3 * 60 * 60 * 1000)).toISOString().split("T")[0];
  const initialCount = events.length;
  events = events.filter(isEventUpcoming);
  pendingEvents = pendingEvents.filter(isEventUpcoming);

  if (events.length < initialCount) {
    console.log(`🧹 [Auto-Delete Event Pruning] Deleted ${initialCount - events.length} completed/expired events.`);
    try {
      const syncedFile = path.join(__dirname, 'synced-campus-events.json');
      fs.writeFileSync(syncedFile, JSON.stringify(events, null, 2), 'utf-8');
    } catch (_) {}
  }

  // Also purge from MongoDB Atlas if connected
  if (mongoDb) {
    safeMongoQuery(mongoDb.collection("events").deleteMany({
      $or: [
        { endDate: { $lt: todayStr } },
        { date: { $lt: todayStr } }
      ]
    })).catch(() => {});
  }
}

// Auto-run event pruning on startup and every 60 seconds
pruneExpiredEvents();
setInterval(pruneExpiredEvents, 60000);

app.get(["/api/events", "/events"], async (req, res) => {
  try {
    // Auto-prune expired events before servicing request
    pruneExpiredEvents();

    const { category, buildingId, featured } = req.query;

    let sourceEvents = events;
    const dbEvents = await safeMongoQuery(mongoDb ? mongoDb.collection("events").find().toArray() : null, null);
    if (Array.isArray(dbEvents) && dbEvents.length > 0) {
      const mergedMap = new Map();
      dbEvents.forEach(e => {
        if (isEventUpcoming(e)) mergedMap.set(getEventKey(e), e);
      });
      events.forEach(e => {
        const k = getEventKey(e);
        if (k && !mergedMap.has(k) && isEventUpcoming(e)) {
          mergedMap.set(k, e);
        }
      });
      sourceEvents = Array.from(mergedMap.values());
    }

    // Public list strictly shows approved upcoming events whose deadline has not passed
    let filtered = (Array.isArray(sourceEvents) ? sourceEvents : events)
      .filter(e => e.status !== "pending_approval")
      .filter(isEventUpcoming);

    if (category) {
      filtered = filtered.filter(e => e.category && e.category.toLowerCase() === category.toLowerCase());
    }
    if (buildingId) {
      filtered = filtered.filter(e => e.buildingId === buildingId);
    }
    if (featured === 'true') {
      filtered = filtered.filter(e => e.featured);
    }
    res.json({
      success: true,
      total: filtered.length,
      events: filtered,
      autoPruningActive: true,
      notice: "Past events and passed deadlines are automatically pruned."
    });
  } catch (err) {
    console.warn("Events API fallback:", err.message);
    const validEvents = events.filter(e => e.status !== "pending_approval" && isEventUpcoming(e));
    res.json({
      success: true,
      total: validEvents.length,
      events: validEvents,
      autoPruningActive: true
    });
  }
});

// Explicit purge endpoint for testing & administrative triggers
app.post("/api/events/purge-expired", (req, res) => {
  const initial = events.length;
  pruneExpiredEvents();
  const purged = initial - events.length;
  res.json({
    success: true,
    purgedCount: purged,
    activeEventsCount: events.length,
    events
  });
});

app.get("/api/events/:id", (req, res) => {
  const event = events.find(e => e.eventId === req.params.id) || pendingEvents.find(e => e.eventId === req.params.id);
  if (!event) {
    return res.status(404).json({ success: false, message: "Event not found" });
  }
  res.json({ success: true, event });
});

app.get("/api/buildings/:buildingId/events", (req, res) => {
  const buildingId = req.params.buildingId;
  const bldgEvents = events.filter(e => e.buildingId === buildingId && e.status !== "pending_approval");
  res.json({
    success: true,
    buildingId,
    total: bldgEvents.length,
    events: bldgEvents
  });
});

// Admin Endpoint: Sync Official Kyambogo Calendar Feed into MongoDB & Map Dataset
app.post("/api/admin/events/sync-calendar", async (req, res) => {
  const adminKey = req.headers["x-admin-key"] || req.body.adminKey;
  if (adminKey !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, message: "Unauthorized. Valid Kyambogo admin passcode required." });
  }

  try {
    const result = await runCalendarSync();
    if (result.success && result.events) {
      const syncedIds = new Set(result.events.map(e => e.eventId));
      const remaining = events.filter(e => !syncedIds.has(e.eventId));
      events = [...result.events, ...remaining];
    }

    let message = `Successfully synchronized ${result.totalSynced} official Kyambogo calendar events into the campus map!`;
    if (result.dbResult && result.dbResult.isAtlasIpRestriction) {
      message += " (Atlas Tip: Add 0.0.0.0/0 in MongoDB Atlas Network Access to allow cloud writes; local & map datasets updated 100%).";
    }

    res.json({
      success: true,
      message,
      totalSynced: result.totalSynced,
      events: result.events,
      dbResult: result.dbResult
    });
  } catch (err) {
    console.error("Calendar sync endpoint error:", err);
    res.status(500).json({ success: false, message: "Error syncing calendar: " + err.message });
  }
});

// Admin Endpoint: Get pending event proposals
app.get("/api/admin/events/pending", (req, res) => {
  const adminKey = req.headers["x-admin-key"] || req.query.adminKey;
  if (adminKey !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, message: "Unauthorized. Valid Kyambogo admin passcode required." });
  }
  res.json({
    success: true,
    total: pendingEvents.length,
    events: pendingEvents
  });
});

// Admin Endpoint: Approve a pending event proposal
app.post("/api/admin/events/:id/approve", (req, res) => {
  const adminKey = req.headers["x-admin-key"] || req.body.adminKey;
  if (adminKey !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, message: "Unauthorized. Valid Kyambogo admin passcode required." });
  }
  const idx = pendingEvents.findIndex(e => e.eventId === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Pending event not found or already reviewed." });
  }
  const [approvedEvent] = pendingEvents.splice(idx, 1);
  approvedEvent.status = "approved";
  approvedEvent.approvedAt = new Date().toISOString();
  events.unshift(approvedEvent);

  res.json({
    success: true,
    message: `Event "${approvedEvent.title}" approved and published to the campus map!`,
    event: approvedEvent
  });
});

// Admin Endpoint: Reject a pending event proposal
app.post("/api/admin/events/:id/reject", (req, res) => {
  const adminKey = req.headers["x-admin-key"] || req.body.adminKey;
  if (adminKey !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, message: "Unauthorized. Valid Kyambogo admin passcode required." });
  }
  const idx = pendingEvents.findIndex(e => e.eventId === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Pending event not found." });
  }
  const [rejectedEvent] = pendingEvents.splice(idx, 1);
  res.json({
    success: true,
    message: `Event proposal "${rejectedEvent.title}" rejected.`,
    event: rejectedEvent
  });
});

app.post("/api/events", (req, res) => {
  const { title, category, buildingId, buildingName, room, startDate, endDate, dateFormatted, time, organizer, description, attendees, latitude, longitude, adminKey } = req.body;
  if (!title || !buildingId) {
    return res.status(400).json({ success: false, message: "Title and building location are required." });
  }

  // Lookup building if lat/lng missing
  const bldg = buildings.find(b => b.buildingId === buildingId);

  const isInstantAdmin = adminKey && adminKey.trim() === ADMIN_PASSCODE;
  const status = isInstantAdmin ? "approved" : "pending_approval";

  const newEvent = {
    eventId: "EVT-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
    title,
    category: category || "academic",
    categoryLabel: category ? category.charAt(0).toUpperCase() + category.slice(1) : "Academic Event",
    buildingId,
    buildingName: buildingName || bldg?.name || "Campus Location",
    room: room || "Main Hall",
    startDate: startDate || new Date().toISOString().split("T")[0],
    endDate: endDate || startDate || new Date().toISOString().split("T")[0],
    dateFormatted: dateFormatted || startDate || "Upcoming",
    time: time || "TBA",
    organizer: organizer || "Kyambogo University Guild / Student Club",
    description: description || "No detailed description provided.",
    attendees: attendees || "Kyambogo University Community",
    featured: false,
    latitude: latitude || bldg?.latitude || 0.3485,
    longitude: longitude || bldg?.longitude || 32.6295,
    status,
    submittedAt: new Date().toISOString()
  };

  if (isInstantAdmin) {
    events.unshift(newEvent);
    return res.status(201).json({
      success: true,
      approved: true,
      message: "Admin authorization verified! Campus event published live to the map.",
      event: newEvent
    });
  } else {
    pendingEvents.unshift(newEvent);
    return res.status(202).json({
      success: true,
      approved: false,
      message: "Event proposal submitted for Administrator / Guild review! Once approved by the campus administration, it will appear on the map.",
      event: newEvent
    });
  }
});

// ==========================================================================
// GEMINI AI INTEGRATION ENDPOINTS
// ==========================================================================

// 1. AI Notice / Event Drafter & Auto-Fill
app.post("/api/ai/enhance-notice", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ success: false, message: "A prompt or raw event note is required." });
  }

  const buildingSummary = buildings.map(b => `${b.buildingId}: "${b.name}"`).join(", ");

  const systemInstruction = `You are the official Kyambogo University Campus AI Notice Assistant.
Your task is to transform rough or unstructured notes from students, faculty deans, club presidents, or guild leaders into a structured, highly professional university announcement.

Allowed categories:
- 'academic' (lectures, seminars, research presentations, course registrations, dean briefings)
- 'tech' (hackathons, code fests, lab workshops, IT demos)
- 'sports' (inter-hall matches, tournaments, training at cricket oval / pitch)
- 'guild' (guild rallies, student government assemblies, townhalls, freshers orientations)
- 'cultural' (music, dance & drama performances, choir festivals, art exhibits)
- 'ceremony' (graduation ceremonies, matriculation, Chancellor speeches, prayer days)
- 'general' (administrative notices, health camp, blood donation)

Official Campus Buildings:
${buildingSummary}

Rules:
- Select the best matching buildingId from the official list above. If unmentioned, pick the most plausible (e.g. 'MAIN-HALL' for general assemblies, 'SCIS-BLOCK' for coding, 'CENTRAL-LIBRARY' for library/study, 'DEPT-PERFORMING-ARTS-MDD' for music).
- Generate a formal, punchy title.
- Suggest a room or hall name.
- Suggest a structured description with an outline/agenda and bullet points.
- Output ONLY valid JSON adhering strictly to the schema.`;

  const userPrompt = `Transform this rough event note into structured JSON:
"${prompt}"

Required JSON fields:
{
  "title": string,
  "category": "academic" | "tech" | "sports" | "guild" | "cultural" | "ceremony" | "general",
  "buildingId": string,
  "room": string,
  "time": string,
  "date": string,
  "organizer": string,
  "description": string
}`;

  try {
    const rawResult = await callGeminiAi(userPrompt, systemInstruction, true);
    const parsed = JSON.parse(rawResult);
    
    // Verify buildingId
    const matchedBldg = buildings.find(b => b.buildingId === parsed.buildingId);
    if (matchedBldg) {
      parsed.buildingName = matchedBldg.name;
      parsed.latitude = matchedBldg.latitude;
      parsed.longitude = matchedBldg.longitude;
    }

    return res.json({
      success: true,
      enhanced: parsed
    });
  } catch (err) {
    console.error("AI Notice enhancement error:", err.message);
    
    // Smart heuristic fallback if API has temporary downtime
    const fallbackCategory = prompt.toLowerCase().includes("sport") || prompt.toLowerCase().includes("match") ? "sports"
      : prompt.toLowerCase().includes("code") || prompt.toLowerCase().includes("tech") ? "tech"
      : prompt.toLowerCase().includes("guild") ? "guild"
      : prompt.toLowerCase().includes("music") || prompt.toLowerCase().includes("drama") ? "cultural"
      : "academic";

    let fallbackBldg = buildings.find(b => prompt.toLowerCase().includes(b.name.toLowerCase()));
    if (!fallbackBldg) fallbackBldg = buildings.find(b => b.buildingId === "MAIN-HALL") || buildings[0];

    return res.json({
      success: true,
      fallback: true,
      enhanced: {
        title: prompt.length > 50 ? prompt.substring(0, 48) + "..." : prompt,
        category: fallbackCategory,
        buildingId: fallbackBldg.buildingId,
        buildingName: fallbackBldg.name,
        room: "Main Hall / Venue",
        time: "10:00 AM – 01:00 PM",
        date: new Date().toISOString().split("T")[0],
        organizer: "Kyambogo University Guild / Faculty",
        description: prompt + "\n\n• Important event for students and staff.\n• Please arrive 15 minutes early."
      }
    });
  }
});

// 2. Interactive Campus AI Guide & Navigator
app.post("/api/ai/ask-campus", async (req, res) => {
  const { question, visitorId, userLocation, history } = req.body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ success: false, message: "A question is required." });
  }

  const vid = visitorId || "anon_" + Math.random().toString(36).substring(2, 9);
  checkDateRoll();
  visitorsSet.add(vid);
  todayVisitorsSet.add(vid);

  // 1. Quota Protection: Check in-memory AI response cache first
  const cacheKey = getCacheKey(question, userLocation);
  const cachedEntry = aiResponseCache.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
    return res.json({
      success: true,
      cached: true,
      data: cachedEntry.data
    });
  }

  const buildingSummary = buildings.map(b => `${b.buildingId}: "${b.name}" (${b.type}) - ${b.description}`).join("\n");

  let locationContextStr = "User Physical Location: Not yet shared by user's browser/device.";
  if (userLocation && typeof userLocation.latitude === "number" && typeof userLocation.longitude === "number") {
    const nb = userLocation.nearestBuilding;
    const nearbyStr = (userLocation.nearbyBuildings && Array.isArray(userLocation.nearbyBuildings))
      ? userLocation.nearbyBuildings.map(b => `"${b.name}" (~${b.distanceMeters}m)`).join(", ")
      : "";
    locationContextStr = `User Physical GPS Location:
- Coordinates: Latitude ${userLocation.latitude.toFixed(6)}, Longitude ${userLocation.longitude.toFixed(6)}
- Closest Kyambogo Landmark / Building: "${nb ? nb.name : 'Central Campus'}" (~${nb ? nb.distanceMeters : 'unknown'} meters away)
- Nearby Facilities: ${nearbyStr || 'Campus center'}`;
  }

  let conversationHistoryStr = "";
  if (Array.isArray(history) && history.length > 0) {
    conversationHistoryStr = "Recent Conversation History:\n" + history.slice(-5).map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join("\n");
  }

  const systemInstruction = `You are "Kyambogo Campus AI", the official interactive intelligent navigator for Kyambogo University Main Campus on Kyambogo Hill, Kampala, Uganda.
You know all university facilities, offices, deans, dining halls, halls of residence, sports grounds, and lecture theatres.

${locationContextStr}

Key Spatial Landmarks & Facts:
- CRITICAL ADMISSIONS DIRECTIVE:
  When inquiries about ADMISSIONS, applications, course requirements, intake, program eligibility, joining Kyambogo University, or admission vetting are made:
  DO NOT DIRECT APPLICANTS OR STUDENTS TO THE SENATE BUILDING OR ADMISSIONS BLOCK!
  The authoritative and required destination is to the FACULTY HEAD (Faculty Dean / Dean's Office / Head of Department) of the respective faculty or school!
  At Kyambogo University, all academic qualification vetting, subject combination checks, program counseling, and admission requirements are conducted directly by the Faculty Head / Dean's Office:
  * Faculty of Engineering (FOE): Dean Dr. Catherine Wandera, Faculty of Engineering & Science Complex, 2nd Floor, Room FE-201 (FACULTY-SCIENCE-ENGINEERING).
  * School of Computing & Information Science (SCIS): Dean Dr. John B. Ngubiri, IICD Building, 3rd Floor, Room CS-301 (SCIS-BLOCK); or HOD BITC in Engineering Complex Wing B.
  * Faculty of Education (FOED): Dean Assoc. Prof. Joyce Ayikoru, Faculty of Education Building, 1st Floor, Room ED-101 (FACULTY-EDUCATION).
  * Faculty of Agriculture & Animal Sciences (FOA): Dean Assoc. Prof. Joseph Ssennyonga, Faculty of Agriculture Complex, 2nd Floor, Room AG-201 (FACULTY-AGRICULTURE).
  * Faculty of Arts and Humanities (FAH): Dean Assoc. Prof. Dr. Robert Ojambo, Faculty of Arts Building, 1st Floor, Room A-101 (FACULTY-ARTS).
  * School of Management and Entrepreneurship (SOME): Dean Dr. Regis Namuddu, NPT Complex, 2nd Floor, Room MB-205 (NPT-BUILDING).
  * School of Built Environment (SBE): Dean Dr. Anthony Gidudu, School of Built Environment, 1st Floor, Room SBE-105 (SCHOOL-BUILT-ENVIRONMENT).
  * School of Art & Industrial Design (SAID): Dean Dr. Emmanuel Mutungi, Art & Design Block 29, Ground Floor, Room SA-10 (ART-DESIGN-BLOCK-29).
  * Faculty of Special Needs & Rehabilitation (FSNR): Dean Dr. Patrick Ojok, Special Needs Complex, Ground Floor, Room SN-101 (FSNR-BLOCK).
  * School of Vocational Studies (SOVS): Dean Dr. Florence Kyomugisha, School of Vocational Studies, 1st Floor, Room VS-102 (SOVS-BLOCK).
  * Institute of Distance Education, e-Learning (IDAEL): Director Dr. Robert Ayine, ODL Centre, 2nd Floor, Room ODL-202 (ODL-CENTRE).
  If no specific course is mentioned in an admissions query, explain that admissions and course vetting are managed directly by each Faculty Head (Dean of Faculty) rather than central Senate, and ask which field they are applying for.
- Faculty of Agriculture & Animal Sciences (FOA): Located at East End near Barclays Library & East End Farm. Offers B.Voc Agriculture with Education, Agribusiness, Crop Science & Animal Production.
- Kyambogo University Medical Centre (Health Services): Located at East Campus on Fisher Road, opposite East Campus Gate and adjacent to Home Economics / Family Life complex, sharing the boundary fence with Nabisunsa Girls.
- Department of Library and Information Science (BLIS): Located on the 1st Floor of the Central Library (Harlow Building). HOD BLIS office is in the Central Library ICT & LIS Wing.
- Department of Computer Science & IT / HOD Bachelor of Information Technology & Computing (BITC): Located at the Faculty of Engineering & Science Complex (Wing B).
- Faculty of Arts & Humanities (FAH): Located at East End beside the Senate Building and Admissions Office.
- Department of Performing Arts (Music, Dance & Drama - MDD / Music Centre): Directly adjacent to the Faculty of Arts building at East End.
- School of Computing & Information Science (SCIS): The Dean's office is on the 3rd Floor of the IICD Building at East End.
- East End Dining Hall: Serves Mandela Hall and Nanziri Hall at East End.
- West End Dining Hall: Near Pearl Hall, Kulubya Hall, and West End Pitch.
- Central Teaching Facility (CTF): Large multi-deck lecture theatre complex in the central academic zone.
- Spiritual & Faith Centres: St. Kakumba Chapel (Anglican), Our Lady of Good Counsel Catholic Chapel, and Kyambogo University Mosque.
- AUTHORITATIVE KYAMBOGO UNIVERSITY RESEARCH & ADMISSIONS SOURCES:
  * Official Admissions Application Portal: https://admissions.kyu.ac.ug (Online application submission & requirements)
  * Directorate of Academic Registrar (AR): https://ar.kyu.ac.ug (Academic calendar, admissions lists, regulations)
  * Student Information System (ACIS / MyPortal): https://myportal.kyu.ac.ug (Student registration, results, tuition)
  * Official University Website: https://kyu.ac.ug
  * Kyambogo University E-Learning Platform (KELMS): https://kelms.kyu.ac.ug
  * University Central Library Digital Repository: https://lib.kyu.ac.ug
  * Directorate of Research and Graduate Training (DRGT): Research proposals, postgraduate degrees, ethics clearance
  When users ask about researching courses, checking eligibility, applying online, or reviewing university regulations, cite these official sources directly.

Campus Buildings Directory:
${buildingSummary}

Rules for Responses:
1. "Where am I located?" / "Where am I?" / "What building am I near?":
   - If user GPS coordinates are provided above:
     Accurately explain their exact position! Tell them they are currently approximately ${userLocation?.nearestBuilding?.distanceMeters || 'a few'} meters from ${userLocation?.nearestBuilding?.name || 'their nearest building'} on Kyambogo Hill. Mention the surrounding buildings and offer walking directions to their destination.
     Set "actionType": "current_location", "suggestedBuildingId": "${userLocation?.nearestBuilding?.buildingId || ''}".
   - If user GPS is NOT provided:
     Explain that their GPS is currently off or waiting for permission, and invite them to tap "📍 Detect My Location" to pinpoint their exact spot!
     Set "actionType": "request_location", "suggestedBuildingId": null.
2. ADMISSIONS INQUIRIES:
   - For ANY questions about admissions, requirements, applications, intake, or joining a course:
     Always direct the applicant to the FACULTY HEAD (Faculty Dean / Dean's Office / HOD) of that academic faculty.
     Never direct admissions to Senate. Set suggestedBuildingId to that Faculty Head's building and actionType: "navigate".
3. For specific building/department questions, identify the exact "suggestedBuildingId" from the directory so the map can navigate them.
4. Always supply 2 to 3 natural follow-up prompt chips in "followUpSuggestions".
5. Keep answers friendly, conversational, warm, and concise (2-4 clear sentences).
6. Always output strict JSON matching the schema.`;

  const userPrompt = `${conversationHistoryStr ? conversationHistoryStr + "\n\n" : ""}User asks: "${question}"

Output JSON format:
{
  "answer": string,
  "suggestedBuildingId": string or null,
  "suggestedBuildingName": string or null,
  "actionType": "navigate" | "current_location" | "request_location" | "info" | "events",
  "followUpSuggestions": string[]
}`;

  try {
    const rawResult = await callGeminiAi(userPrompt, systemInstruction, true);
    const parsed = JSON.parse(rawResult);

    if (parsed.suggestedBuildingId) {
      const bldg = buildings.find(b => b.buildingId === parsed.suggestedBuildingId);
      if (bldg) {
        parsed.building = {
          buildingId: bldg.buildingId,
          name: bldg.name,
          type: bldg.type,
          latitude: bldg.latitude,
          longitude: bldg.longitude
        };
      }
    }

    // Save successful AI response to in-memory cache to conserve API quota
    if (aiResponseCache.size >= CACHE_MAX_ENTRIES) {
      const firstKey = aiResponseCache.keys().next().value;
      aiResponseCache.delete(firstKey);
    }
    aiResponseCache.set(cacheKey, { timestamp: Date.now(), data: parsed });

    // Persist chat log to enhance future AI responses and admin analytics
    const chatLogEntry = {
      chatId: "chat_" + Math.random().toString(36).substring(2, 9),
      visitorId: vid,
      question: question.trim(),
      answer: parsed.answer || "Generated response",
      suggestedBuildingId: parsed.suggestedBuildingId || null,
      suggestedBuildingName: parsed.suggestedBuildingName || null,
      actionType: parsed.actionType || "info",
      timestamp: new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "unknown"
    };
    chatLogsHistory.unshift(chatLogEntry);
    if (chatLogsHistory.length > 500) chatLogsHistory.pop();

    if (mongoDb) {
      mongoDb.collection("ai_chats").insertOne(chatLogEntry).catch(e => console.warn("MongoDB chat log notice:", e.message));
    }

    return res.json({
      success: true,
      data: parsed
    });
  } catch (err) {
    console.warn("AI Ask Campus using Offline Grounded Engine (Reason:", err.message, ")");
    
    // Comprehensive Offline Campus Grounded Reasoner (Quota Exceeded & Offline Protection)
    const qLower = question.toLowerCase();
    const isLocationQuery = qLower.includes("where am i") || qLower.includes("where i am") || qLower.includes("my location") || qLower.includes("where located") || qLower.includes("closest to me");

    if (isLocationQuery) {
      if (userLocation && userLocation.nearestBuilding) {
        const nb = userLocation.nearestBuilding;
        const answer = `You are currently standing near **${nb.name}** (approximately ${nb.distanceMeters}m away) on Kyambogo campus. Nearby landmarks include ${userLocation.nearbyBuildings ? userLocation.nearbyBuildings.slice(1).map(b => b.name).join(', ') : 'campus walkways'}. Where would you like to walk to next?`;
        return res.json({
          success: true,
          quotaProtected: true,
          data: {
            answer,
            suggestedBuildingId: nb.buildingId,
            suggestedBuildingName: nb.name,
            building: {
              buildingId: nb.buildingId,
              name: nb.name,
              latitude: nb.latitude,
              longitude: nb.longitude
            },
            actionType: "current_location",
            followUpSuggestions: ["Walk there from here", "What offices are inside?", "Where is the nearest dining hall?"]
          }
        });
      } else {
        return res.json({
          success: true,
          quotaProtected: true,
          data: {
            answer: "To tell you your exact position on Kyambogo campus, I need your GPS coordinates. Tap the **'📍 Detect My Location'** button below to allow location access, and I will pinpoint your location and nearest building immediately!",
            suggestedBuildingId: null,
            suggestedBuildingName: null,
            building: null,
            actionType: "request_location",
            followUpSuggestions: ["Where is Central Library?", "Where is Faculty of Arts?", "Where is the Senate Building?"]
          }
        });
      }
    }

    // Specific Landmark, Admissions & Department Heuristic Matchers
    let matchedBldg = null;
    let fallbackAnswer = "";
    let followUps = ["Walk there from here", "What offices are inside?", "Find nearest dining hall"];

    // 1. Authoritative Admissions Directive: Direct to Faculty Head (Faculty Dean / HOD), NOT Senate
    const isAdmissionsQuery = qLower.includes("admiss") || 
      qLower.includes("adnisi") || 
      qLower.includes("apply") || 
      qLower.includes("applying") || 
      qLower.includes("intake") || 
      qLower.includes("join") || 
      (qLower.includes("course") && (qLower.includes("require") || qLower.includes("entry") || qLower.includes("qualif"))) ||
      (qLower.includes("senat") && (qLower.includes("admiss") || qLower.includes("adnisi")));

    if (isAdmissionsQuery) {
      if (qLower.includes("engineer") || qLower.includes("civil") || qLower.includes("mech") || qLower.includes("electr") || qLower.includes("telecom") || qLower.includes("automotive") || qLower.includes("mining")) {
        matchedBldg = buildings.find(b => b.buildingId === "FACULTY-SCIENCE-ENGINEERING");
        fallbackAnswer = "For **Engineering Admissions**, requirements, and qualification vetting, report directly to the **Faculty Head: Dean of Engineering (Dr. Catherine Wandera)** at the **Faculty of Engineering & Science Complex, 2nd Floor, Room FE-201** (do NOT go to Senate). The Faculty Dean's office conducts all department-level entry vetting, course clearances, and academic approvals.";
        followUps = ["Navigate to Engineering Dean", "Who is the Dean of Engineering?", "What departments are in Engineering?"];
      } else if (qLower.includes("comput") || qLower.includes("bitc") || qLower.includes("software") || qLower.includes("information system") || qLower.includes("cs ") || qLower.includes("it ")) {
        matchedBldg = buildings.find(b => b.buildingId === "SCIS-BLOCK") || buildings.find(b => b.buildingId === "FACULTY-SCIENCE-ENGINEERING");
        fallbackAnswer = "For **Computing & IT Admissions** (Computer Science, Software Engineering, BITC, Information Systems), report directly to the **Faculty Head: Dean of SCIS (Dr. John B. Ngubiri)** at the **IICD Building, 3rd Floor, Room CS-301** (or HOD BITC in Engineering Complex Wing B). Course eligibility and admission clearances are handled at the Faculty Dean's office, NOT Senate!";
        followUps = ["Navigate to Computing Dean (IICD)", "Where is HOD BITC?", "Where is Central Library?"];
      } else if (qLower.includes("educat") || qLower.includes("teach") || qLower.includes("psychology")) {
        matchedBldg = buildings.find(b => b.buildingId === "FACULTY-EDUCATION");
        fallbackAnswer = "For **Education Admissions** (Teacher Education, Arts/Science with Education, Curriculum Studies), report directly to the **Faculty Head: Dean of Education (Assoc. Prof. Joyce Ayikoru)** at the **Faculty of Education Building, 1st Floor, Room ED-101**. Academic vetting and subject combination clearance are issued at the Faculty Dean's office.";
        followUps = ["Navigate to Faculty of Education", "Who is the Dean of Education?", "Where is CTF?"];
      } else if (qLower.includes("agric") || qLower.includes("crop") || qLower.includes("animal production") || qLower.includes("bvoc")) {
        matchedBldg = buildings.find(b => b.buildingId === "FACULTY-AGRICULTURE");
        fallbackAnswer = "For **Agriculture & Animal Sciences Admissions**, report directly to the **Faculty Head: Dean of Agriculture (Assoc. Prof. Joseph Ssennyonga)** at the **Faculty of Agriculture Complex, 2nd Floor, Room AG-201** at East End. The Faculty Head verifies qualification requirements and issues academic clearance.";
        followUps = ["Navigate to Faculty of Agriculture", "Who is the Dean of Agriculture?", "Where is Barclays Library?"];
      } else if (qLower.includes("arts") || qLower.includes("humanit") || qLower.includes("language") || qLower.includes("literature") || qLower.includes("history") || qLower.includes("performing") || qLower.includes("mdd")) {
        matchedBldg = buildings.find(b => b.buildingId === "FACULTY-ARTS");
        fallbackAnswer = "For **Arts & Humanities Admissions**, report directly to the **Faculty Head: Dean of Arts and Humanities (Assoc. Prof. Dr. Robert Ojambo)** at the **Faculty of Arts Building, 1st Floor, Room A-101**. The Faculty Dean provides direct admissions clearance and subject combination guidance.";
        followUps = ["Navigate to Faculty of Arts", "Where is Department of MDD?", "Where is Central Library?"];
      } else if (qLower.includes("business") || qLower.includes("bba") || qLower.includes("account") || qLower.includes("finance") || qLower.includes("procurement") || qLower.includes("market") || qLower.includes("management") || qLower.includes("some")) {
        matchedBldg = buildings.find(b => b.buildingId === "NPT-BUILDING");
        fallbackAnswer = "For **Business & Management Admissions (SOME)**, report directly to the **Faculty Head: Dean of Management & Entrepreneurship (Dr. Regis Namuddu)** at the **NPT Complex, 2nd Floor, Room MB-205**. Entry vetting and course clearance are handled at the Faculty Dean's level.";
        followUps = ["Navigate to SOME (NPT Complex)", "Who is the Dean of SOME?", "Where is Stanbic Bank?"];
      } else if (qLower.includes("built") || qLower.includes("architect") || qLower.includes("survey") || qLower.includes("quantity") || qLower.includes("planning") || qLower.includes("sbe")) {
        matchedBldg = buildings.find(b => b.buildingId === "SCHOOL-BUILT-ENVIRONMENT");
        fallbackAnswer = "For **Built Environment Admissions** (Architecture, Building Economics, Land Economics, Physical Planning), report directly to the **Faculty Head: Dean of SBE (Dr. Anthony Gidudu)** at the **School of Built Environment, 1st Floor, Room SBE-105**.";
        followUps = ["Navigate to School of Built Environment", "Where is North Hall?", "Where is Engineering Complex?"];
      } else if (qLower.includes("special need") || qLower.includes("rehab") || qLower.includes("sign language") || qLower.includes("fsnr")) {
        matchedBldg = buildings.find(b => b.buildingId === "FSNR-BLOCK");
        fallbackAnswer = "For **Special Needs & Rehabilitation Admissions**, report directly to the **Faculty Head: Dean of FSNR (Dr. Patrick Ojok)** at the **Special Needs Complex, Ground Floor, Room SN-101**.";
        followUps = ["Navigate to Special Needs Faculty", "Where is North Hall?", "Where is Kyambogo Mosque?"];
      } else if (qLower.includes("vocational") || qLower.includes("catering") || qLower.includes("hotel") || qLower.includes("nutrition") || qLower.includes("cosmetology") || qLower.includes("fashion") || qLower.includes("sovs")) {
        matchedBldg = buildings.find(b => b.buildingId === "SOVS-BLOCK");
        fallbackAnswer = "For **Vocational Studies Admissions** (Hotel & Catering, Nutrition & Dietetics, Fashion & Cosmetology), report directly to the **Faculty Head: Dean of SOVS (Dr. Florence Kyomugisha)** at the **School of Vocational Studies, 1st Floor, Room VS-102**.";
        followUps = ["Navigate to School of Vocational Studies", "Where is Education Faculty?", "Where is West End Dining?"];
      } else {
        matchedBldg = buildings.find(b => b.buildingId === "FACULTY-SCIENCE-ENGINEERING");
        fallbackAnswer = "For academic admissions, qualification vetting, course requirements, and departmental clearance at Kyambogo University, you must report directly to your **Faculty Head (Dean of Faculty)** rather than the Senate Building! You can also apply online and check application requirements directly via the official Kyambogo portal: **https://admissions.kyu.ac.ug**. Each Faculty Dean verifies academic eligibility and approves entry for their specific programmes. Which course or faculty are you applying for? (e.g., Engineering, Computing, Education, Business, Arts, Agriculture, Built Environment)";
        followUps = ["Engineering Admissions (Faculty Head)", "Computing (BITC) Admissions", "Education Admissions (Faculty Head)", "Business Admissions (Faculty Head)", "Agriculture Admissions (Faculty Head)"];
      }
    } else if (qLower.includes("medical") || qLower.includes("hospital") || qLower.includes("clinic") || qLower.includes("health")) {
      matchedBldg = buildings.find(b => b.buildingId === "KYU-MEDICAL-CENTRE") || buildings.find(b => b.type === "medical");
      fallbackAnswer = "The **Kyambogo University Medical Centre** is located on Kyambogo Road at coordinates (0.347841, 32.625019) on Kyambogo campus, opposite the health gate. It provides 24/7 outpatient, emergency, laboratory, and pharmacy services.";
      followUps = ["Navigate to Medical Centre", "Where is Central Library?", "Where is the Senate Building?"];
    } else if (qLower.includes("agriculture") || qLower.includes("agric") || qLower.includes("crop") || qLower.includes("animal production") || qLower.includes("bvoc")) {
      matchedBldg = buildings.find(b => b.buildingId === "FACULTY-AGRICULTURE");
      fallbackAnswer = "The **Faculty of Agriculture & Animal Sciences Complex** is located at East End near the Barclays Library and the East End Demonstration Farm. It houses the Dean's Office, Department of Agriculture & Animal Production, and labs for Crop Science, Soil Science, and Agribusiness.";
      followUps = ["Navigate to Faculty of Agriculture", "Who is the Dean of Agriculture?", "Where is the East End Dining Hall?"];
    } else if (qLower.includes("library and information") || qLower.includes("blis") || qLower.includes("dlis")) {
      matchedBldg = buildings.find(b => b.buildingId === "CENTRAL-LIBRARY");
      fallbackAnswer = "The **Department of Library and Information Science (BLIS)** and the HOD Office are located on the **1st Floor of the Central Library (Harlow Building)** in the ICT & LIS Wing, right at the central academic spine of Kyambogo campus.";
      followUps = ["Navigate to Central Library", "Where is SCIS IICD Building?", "Where is the CTF?"];
    } else if (qLower.includes("information technology and computing") || qLower.includes("bitc") || (qLower.includes("computing") && qLower.includes("engineering"))) {
      matchedBldg = buildings.find(b => b.buildingId === "FACULTY-SCIENCE-ENGINEERING");
      fallbackAnswer = "The **HOD Office for Bachelor of Information Technology & Computing (BITC)** is located in **Wing B (Room EC-108)** of the **Faculty of Engineering & Science Complex**, situated along the West End academic avenue near the engineering labs.";
      followUps = ["Navigate to Engineering Complex", "Where is the Central Library?", "Where is the Senate Building?"];
    } else {
      matchedBldg = buildings.find(b => 
        qLower.includes(b.name.toLowerCase()) || 
        (b.description && qLower.includes(b.description.toLowerCase())) ||
        (b.buildingId && qLower.includes(b.buildingId.toLowerCase().replace('-', ' ')))
      ) || buildings.find(b => b.buildingId === "CENTRAL-LIBRARY");

      fallbackAnswer = matchedBldg ? `You can find **${matchedBldg.name}** on Kyambogo campus at coordinates ${matchedBldg.latitude.toFixed(6)}, ${matchedBldg.longitude.toFixed(6)}. ${matchedBldg.description}` : "Kyambogo University features academic faculties, administrative offices, dining halls, and student accommodation spread across East End and West End.";
    }

    const fallbackLog = {
      chatId: "chat_" + Math.random().toString(36).substring(2, 9),
      visitorId: vid,
      question: question.trim(),
      answer: fallbackAnswer,
      suggestedBuildingId: matchedBldg ? matchedBldg.buildingId : null,
      suggestedBuildingName: matchedBldg ? matchedBldg.name : null,
      actionType: matchedBldg ? "navigate" : "info",
      timestamp: new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "unknown",
      quotaProtected: true
    };
    chatLogsHistory.unshift(fallbackLog);

    if (mongoDb) {
      mongoDb.collection("ai_chats").insertOne(fallbackLog).catch(() => {});
    }

    return res.json({
      success: true,
      quotaProtected: true,
      data: {
        answer: fallbackAnswer,
        suggestedBuildingId: matchedBldg ? matchedBldg.buildingId : null,
        suggestedBuildingName: matchedBldg ? matchedBldg.name : null,
        building: matchedBldg ? {
          buildingId: matchedBldg.buildingId,
          name: matchedBldg.name,
          type: matchedBldg.type,
          latitude: matchedBldg.latitude,
          longitude: matchedBldg.longitude
        } : null,
        actionType: matchedBldg ? "navigate" : "info",
        followUpSuggestions: followUps
      }
    });
  }
});

// 3. User & Session Visit Analytics Tracker
app.post(["/api/analytics/visit", "/analytics/visit"], async (req, res) => {
  try {
    const body = req.body || {};
    const vid = body.visitorId || "anon_" + Math.random().toString(36).substring(2, 9);
    
    checkDateRoll();
    visitorsSet.add(vid);
    todayVisitorsSet.add(vid);
    totalVisitsCount++;

    const visitRecord = {
      visitorId: vid,
      path: body.path || "/",
      userAgent: body.userAgent || req.headers["user-agent"] || "unknown",
      timestamp: new Date().toISOString()
    };

    if (mongoDb) {
      try {
        mongoDb.collection("visits").insertOne(visitRecord).catch(() => {});
        mongoDb.collection("visitors").updateOne(
          { visitorId: vid },
          { 
            $set: { lastActiveAt: new Date().toISOString(), userAgent: visitRecord.userAgent },
            $inc: { visitCount: 1 },
            $setOnInsert: { firstSeenAt: new Date().toISOString() }
          },
          { upsert: true }
        ).catch(() => {});
      } catch (e) {
        console.warn("MongoDB analytics write notice:", e.message);
      }
    }

    res.json({
      success: true,
      visitorId: vid,
      totalVisits: totalVisitsCount,
      uniqueVisitors: visitorsSet.size,
      todayActive: todayVisitorsSet.size
    });
  } catch (err) {
    res.json({
      success: true,
      visitorId: "anon",
      totalVisits: totalVisitsCount,
      uniqueVisitors: 1,
      todayActive: 1
    });
  }
});

// 4. Admin Analytics & User Tracking Metrics
app.get("/api/admin/analytics", async (req, res) => {
  checkDateRoll();
  let dbUniqueCount = visitorsSet.size;
  let dbTotalVisits = totalVisitsCount;

  if (mongoDb) {
    try {
      const vCount = await mongoDb.collection("visitors").countDocuments();
      if (vCount > dbUniqueCount) dbUniqueCount = vCount;
      const sCount = await mongoDb.collection("visits").countDocuments();
      if (sCount > dbTotalVisits) dbTotalVisits = sCount;
    } catch (e) {}
  }

  res.json({
    success: true,
    uniqueVisitors: Math.max(dbUniqueCount, 1),
    todayActive: Math.max(todayVisitorsSet.size, 1),
    totalVisits: Math.max(dbTotalVisits, 1),
    totalAiChats: chatLogsHistory.length,
    recentChats: chatLogsHistory.slice(0, 50)
  });
});

// 5. Admin AI Chat Logs History & Training Data Explorer
app.get("/api/admin/chats", async (req, res) => {
  let chats = [...chatLogsHistory];
  if (mongoDb) {
    try {
      const dbChats = await mongoDb.collection("ai_chats").find().sort({ timestamp: -1 }).limit(100).toArray();
      if (dbChats && dbChats.length > 0) chats = dbChats;
    } catch (e) {}
  }

  res.json({
    success: true,
    total: chats.length,
    chats
  });
});

app.post("/api/db/seed", async (req, res) => {
  const uri = req.body?.uri || process.env.MONGODB_URI;
  if (!uri) {
    return res.status(400).json({
      success: false,
      message: "No MONGODB_URI provided in environment or request body."
    });
  }

  try {
    const client = new MongoClient(uri);
    await client.connect();
    const dbName = req.body?.dbName || process.env.MONGODB_DB_NAME || "kyambiDM";
    const db = client.db(dbName);

    // Sync collections
    for (const b of buildings) {
      await db.collection("buildings").updateOne({ buildingId: b.buildingId }, { $set: b }, { upsert: true });
    }
    for (const f of faculties) {
      await db.collection("faculties").updateOne({ facultyId: f.facultyId }, { $set: f }, { upsert: true });
    }
    for (const d of departments) {
      await db.collection("departments").updateOne({ departmentId: d.departmentId }, { $set: d }, { upsert: true });
    }
    for (const p of programmes) {
      await db.collection("programmes").updateOne({ programmeId: p.programmeId }, { $set: p }, { upsert: true });
    }
    for (const dest of destinations) {
      await db.collection("destinations").updateOne({ destinationId: dest.destinationId }, { $set: dest }, { upsert: true });
    }
    for (const o of campusOffices) {
      await db.collection("offices").updateOne({ officeId: o.officeId }, { $set: o }, { upsert: true });
    }

    await client.close();

    res.json({
      success: true,
      message: `Successfully uploaded and seeded all campus data into MongoDB Atlas database "${dbName}"!`,
      counts: {
        buildings: buildings.length,
        faculties: faculties.length,
        departments: departments.length,
        programmes: programmes.length,
        destinations: destinations.length,
        offices: campusOffices.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database seed failed: " + error.message
    });
  }
});

// =========================================================================
// START NODE.JS SERVER
// =========================================================================

async function startServer() {
  // Serve public assets (PWA manifest, icons, service worker, assetlinks.json)
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Explicit route for Google Play Digital Asset Links
  app.get('/.well-known/assetlinks.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
  });

  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NOW_REGION ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
  );

  if (process.env.NODE_ENV !== 'production' && !isServerless) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Kyambi DCM Node server running at http://localhost:${PORT}`);
  });
}

// Global unhandled error handler so API never crashes or returns unhandled 500
app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);
  res.status(200).json({
    success: false,
    fallback: true,
    error: err.message
  });
});

// In Vercel serverless functions, export the Express app directly without calling listen()
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
);

if (isDirectExecution && !isServerless) {
  startServer();
}

export { app };
export default app;
