const fs = require('fs');

const updatedBuildings = [
  {
    "buildingId": "SENATE-BUILDING",
    "name": "Senate Building",
    "type": "administration",
    "latitude": 0.347766,
    "longitude": 32.631922,
    "description": "Kyambogo University Senate Building — Council, Senate Secretariat, Vice Chancellor & Executive offices (Note: For course admissions & academic qualification vetting, applicants report directly to the respective Faculty Head / Dean of Faculty, not Senate)",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "ADMISSIONS-BLOCK",
    "name": "Admissions Block & Academic Registrar Archive",
    "type": "administration",
    "latitude": 0.347991,
    "longitude": 32.631955,
    "description": "Office of the Academic Registrar, central student files, registration & transcript verification (Important: Course applications, academic requirements and program clearance are issued directly by each Faculty Head / Dean's Office)",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "CENTRAL-TEACHING-FACILITY",
    "name": "Central Teaching Facility (CTF)",
    "type": "academic",
    "latitude": 0.349258,
    "longitude": 32.630658,
    "description": "Multi-storey modern lecture halls, auditoriums, and seminar rooms at the central academic spine",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "CENTRAL-LIBRARY",
    "name": "Central Library (Main Library)",
    "type": "library",
    "latitude": 0.350833,
    "longitude": 32.630817,
    "description": "Main University Library, research catalog, and digital resource center",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "KYAMBOGO-COLLEGE-ADMIN",
    "name": "Main Administration Block (Council & VC Office)",
    "type": "administration",
    "latitude": 0.350140,
    "longitude": 32.632892,
    "description": "Vice Chancellor, Deputy Vice Chancellors, University Secretary, Bursar",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "STUDENT-CENTER",
    "name": "Student Center & Guild Canteen",
    "type": "cafeteria",
    "latitude": 0.348777,
    "longitude": 32.629508,
    "description": "Guild Government offices, student union, dining hall, and central campus meeting hub",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "KYU-MEDICAL-CENTRE",
    "name": "Kyambogo University Medical Centre",
    "type": "medical",
    "latitude": 0.347841,
    "longitude": 32.625019,
    "description": "Kyambogo University Medical Centre — 24/7 University Health Centre, outpatient clinic, pharmacy & emergency medical services on Kyambogo Road",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "FACULTY-AGRICULTURE",
    "name": "Faculty of Agriculture & Animal Sciences Complex",
    "type": "academic",
    "latitude": 0.345820,
    "longitude": 32.634850,
    "description": "Faculty of Agriculture and Animal Sciences Complex & Demonstration Farm — Dean Assoc. Prof. Joseph Ssennyonga, Crop Science, Animal Production & Agribusiness near Barclays Library at East End",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "SCIS-BLOCK",
    "name": "School of Computing & Information Science (IICD Building)",
    "type": "academic",
    "latitude": 0.347424,
    "longitude": 32.631801,
    "description": "School of Computing and Information Science (SCIS) Headquarters at IICD Building — Dean Dr. John B. Ngubiri, Computer Science, Software Engineering & AI Labs",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "NPT-BUILDING",
    "name": "School of Management & Entrepreneurship (SOME / NPT Complex)",
    "type": "academic",
    "latitude": 0.346625,
    "longitude": 32.631234,
    "description": "School of Management and Entrepreneurship at NPT Complex — Dean Dr. Regis Namuddu, Accounting & Finance, Business Administration, Procurement, Marketing",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "FACULTY-EDUCATION",
    "name": "Faculty of Education (FOED)",
    "type": "academic",
    "latitude": 0.349403,
    "longitude": 32.626870,
    "description": "Faculty of Education — Dean Assoc. Prof. Joyce Ayikoru, Teacher Education, Educational Psychology, Curriculum Studies",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "FACULTY-SCIENCE-ENGINEERING",
    "name": "Faculty of Engineering & Science Complex",
    "type": "academic",
    "latitude": 0.348597,
    "longitude": 32.626483,
    "description": "Office of the Dean of Engineering (Dr. Catherine Wandera), Electrical & Biomedical Labs, HOD BITC (Wing B)",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "CIVIL-LECTURE-ROOMS",
    "name": "Civil Engineering Lecture Rooms & Department",
    "type": "academic",
    "latitude": 0.348566,
    "longitude": 32.629298,
    "description": "Civil & Environmental Engineering offices, lecture theaters, design labs",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "MECHANICAL-BLOCK",
    "name": "Department of Mechanical Engineering",
    "type": "academic",
    "latitude": 0.348222,
    "longitude": 32.626889,
    "description": "Mechanical & Production Engineering department, HOD office, staff rooms, CAD labs",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "LANDS-LECTURE-ROOMS",
    "name": "Lands Lecture Rooms & Mining Engineering",
    "type": "academic",
    "latitude": 0.349175,
    "longitude": 32.629137,
    "description": "Mining, Chemical, Petroleum & Land surveying teaching rooms",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "ODL-CENTRE",
    "name": "Open Distance & e-Learning Centre (IDAEL)",
    "type": "academic",
    "latitude": 0.350215,
    "longitude": 32.626403,
    "description": "Institute of Distance Education, e-Learning and External Studies — Director Dr. Robert Ayine",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "SCHOOL-BUILT-ENVIRONMENT",
    "name": "School of Built Environment (SBE)",
    "type": "academic",
    "latitude": 0.355521,
    "longitude": 32.625269,
    "description": "School of Built Environment — Dean Dr. Anthony Gidudu, Architecture, Building Economics, Physical Planning, Real Estate & Construction",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "ART-DESIGN-BLOCK-29",
    "name": "School of Art & Industrial Design (Block 29)",
    "type": "academic",
    "latitude": 0.347589,
    "longitude": 32.633824,
    "description": "School of Art and Industrial Design — Dean Dr. Emmanuel Mutungi, Fine Art, Graphics, Ceramics, Textiles, Sculpture studios",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "DEPT-LANGUAGES-BUILDING",
    "name": "Department of Languages and Communication",
    "type": "academic",
    "latitude": 0.348943,
    "longitude": 32.631501,
    "description": "Department of Languages and Communication — Staff offices, language classrooms",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "SOVS-BLOCK",
    "name": "School of Vocational Studies (SOVS)",
    "type": "academic",
    "latitude": 0.349506,
    "longitude": 32.627588,
    "description": "School of Vocational Studies — Dean Dr. Florence Kyomugisha, Hotel & Catering, Nutrition & Dietetics, Fashion & Cosmetology",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "FSNR-BLOCK",
    "name": "Faculty of Special Needs & Rehabilitation (FSNR)",
    "type": "academic",
    "latitude": 0.353773,
    "longitude": 32.625336,
    "description": "Faculty of Special Needs and Rehabilitation — Dean Dr. Patrick Ojok, Community Based Rehabilitation, Sign Language Interpreting",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "TECHNICAL-TEACHER-BLOCK",
    "name": "Technical Teacher Block",
    "type": "academic",
    "latitude": 0.350350,
    "longitude": 32.628100,
    "description": "Instructor education and technical teacher training",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "MAIN-LECTURE-BLOCK",
    "name": "Kyambogo Main Lecture Block (West End Main Hall)",
    "type": "academic",
    "latitude": 0.348261,
    "longitude": 32.625876,
    "description": "Large lecture auditoriums, West End Main Hall, and administrative consultation rooms",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "CENTRAL-SCIENCE-LAB",
    "name": "Central Science Laboratory",
    "type": "laboratory",
    "latitude": 0.350055,
    "longitude": 32.628929,
    "description": "Physics, Chemistry, and Biology research laboratories",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "ENGINEERING-LABORATORIES",
    "name": "Engineering Laboratories & Workshops",
    "type": "laboratory",
    "latitude": 0.348340,
    "longitude": 32.628150,
    "description": "Electrical, Biomedical, Mechanical, Strength of Materials & Civil workshops",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "RAC-BUILDING",
    "name": "RAC Building (Refrigeration & Air Conditioning)",
    "type": "laboratory",
    "latitude": 0.346485,
    "longitude": 32.631791,
    "description": "Refrigeration and Air Conditioning technical workshops, engineering labs",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "BARCLAYS-LIBRARY",
    "name": "Barclays Library / East End Library",
    "type": "library",
    "latitude": 0.348176,
    "longitude": 32.632912,
    "description": "East End library branch and study rooms",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "WEST-END-LIBRARY",
    "name": "West End Library",
    "type": "library",
    "latitude": 0.349056,
    "longitude": 32.625625,
    "description": "West End faculty & student study library",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "MANDELA-HALL",
    "name": "Mandela Hall / Africa Block",
    "type": "hall",
    "latitude": 0.346474,
    "longitude": 32.630715,
    "description": "Student Hall of Residence (East End)",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "NANZIRI-HALL",
    "name": "Nanziri Upper Hall",
    "type": "hall",
    "latitude": 0.347106,
    "longitude": 32.629866,
    "description": "Female student residence hall (East End)",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "BLUE-NILE-HALL",
    "name": "Blue Nile Hall (Nanziri Lower)",
    "type": "hall",
    "latitude": 0.345861,
    "longitude": 32.630706,
    "description": "Student Hall of Residence block",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "KULUBYA-HALL",
    "name": "Kulubya Hall",
    "type": "hall",
    "latitude": 0.351671,
    "longitude": 32.625778,
    "description": "Male student hall of residence (West End)",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "PEARL-HALL",
    "name": "Pearl Hall",
    "type": "hall",
    "latitude": 0.351536,
    "longitude": 32.624990,
    "description": "Female student residence hall (West End)",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "NORTH-HALL",
    "name": "North Hall",
    "type": "hall",
    "latitude": 0.353845,
    "longitude": 32.625583,
    "description": "Student residence hall on North side",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "EAST-END-DINING",
    "name": "East End Dining Hall (Mandela & Nanziri)",
    "type": "cafeteria",
    "latitude": 0.346002,
    "longitude": 32.631062,
    "description": "East End student catering, dining hall, and cafeteria serving Mandela and Nanziri residential halls",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "WEST-END-DINING",
    "name": "West End Dining Hall",
    "type": "cafeteria",
    "latitude": 0.350024,
    "longitude": 32.627933,
    "description": "West End student dining hall",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "STANBIC-KYAMBOGO",
    "name": "Stanbic Bank Kyambogo Branch",
    "type": "bank",
    "latitude": 0.347449,
    "longitude": 32.631364,
    "description": "Full service bank branch & 24/7 ATM",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "ECOBANK-KYAMBOGO",
    "name": "Ecobank Kyambogo Branch",
    "type": "bank",
    "latitude": 0.347569,
    "longitude": 32.630081,
    "description": "Ecobank banking hall & 24/7 ATM",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "FRUIT-CENTRE",
    "name": "Fruit Centre & Campus Canteen",
    "type": "cafeteria",
    "latitude": 0.347054,
    "longitude": 32.631284,
    "description": "Fresh fruits, juices, snacks and campus provisions",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "KYAMBOGO-MOSQUE",
    "name": "Kyambogo University Mosque",
    "type": "worship",
    "latitude": 0.352416,
    "longitude": 32.626684,
    "description": "University Islamic Centre and Mosque",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "ST-KAKUMBA-CHAPEL",
    "name": "St. Kakumba Chapel",
    "type": "worship",
    "latitude": 0.347544,
    "longitude": 32.628720,
    "description": "Anglican Protestant Chapel",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "UGANDA-MARTYRS-CHAPLAINCY",
    "name": "Uganda Martyrs Catholic Chaplaincy",
    "type": "worship",
    "latitude": 0.351599,
    "longitude": 32.627113,
    "description": "Catholic community chapel & chaplaincy",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "SDA-CHURCH",
    "name": "Seventh Day Adventist Church/Chapel",
    "type": "worship",
    "latitude": 0.346876,
    "longitude": 32.628494,
    "description": "SDA student chapel",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "WEST-END-SPORTS-PITCH",
    "name": "West End Sports Pitch / Kyambogo Cricket Ground",
    "type": "sports",
    "latitude": 0.345149,
    "longitude": 32.626334,
    "description": "Main sports stadium, running track, and cricket pitch",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "EAST-END-PITCH",
    "name": "Graduation Grounds & East End Sports Pitch",
    "type": "sports",
    "latitude": 0.346561,
    "longitude": 32.633646,
    "description": "Official Kyambogo University graduation grounds, ceremonial pavilion, and East End sports pitch",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "KYAMBOGO-POLICE-POST",
    "name": "Kyambogo University Police Station",
    "type": "police",
    "latitude": 0.350176,
    "longitude": 32.626101,
    "description": "Kyambogo University Police Station — 24/7 campus security headquarters, incident reporting, and emergency response",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "FACULTY-ARTS",
    "name": "Faculty of Arts & Humanities (Faculty of Arts Building)",
    "type": "academic",
    "latitude": 0.347832,
    "longitude": 32.631358,
    "description": "Faculty of Arts and Humanities — Dean Assoc. Prof. Dr. Robert Ojambo, History, Geography, Literature lecture theatres",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "DEPT-PERFORMING-ARTS-MDD",
    "name": "Department of Performing Arts (Music, Dance & Drama)",
    "type": "academic",
    "latitude": 0.347585,
    "longitude": 32.631074,
    "description": "Department of Performing Arts (MDD) & Music Centre — Sound studios, dance rehearsal halls, instrument labs, and HOD office",
    "coordinateStatus": "verified"
  },
  {
    "buildingId": "PEACE-PARK",
    "name": "Peace Park & Campus Shaded Lawns",
    "type": "landmark",
    "latitude": 0.350055,
    "longitude": 32.628929,
    "description": "Central campus public green park, tree-shaded study gardens, student meetings, and outdoor university events",
    "coordinateStatus": "verified"
  }
];

const updatedEvents = [
  {
    "eventId": "EVT-GRAD-2026",
    "title": "21st Kyambogo University Graduation Ceremony",
    "category": "ceremony",
    "categoryLabel": "🎓 Graduation Ceremony",
    "buildingId": "EAST-END-PITCH",
    "buildingName": "Graduation Grounds & East End Sports Pitch",
    "room": "Main Ceremonial Pavilion & Marquee Grounds",
    "startDate": "2026-10-14",
    "endDate": "2026-10-16",
    "dateFormatted": "Oct 14 - 16, 2026",
    "time": "07:30 AM - 04:30 PM",
    "organizer": "Office of the Academic Registrar & University Senate",
    "description": "The 21st graduation ceremony for the conferment of doctorate degrees, master's, post-graduate diplomas, bachelor's degrees, and ordinary diplomas for all 9 faculties and schools.",
    "attendees": "Graduands, Parents, Academic Staff & Dignitaries",
    "featured": true,
    "latitude": 0.346561,
    "longitude": 32.633646,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-HEALTH-CAMP",
    "title": "Kyambogo Medical Center Community Health Outreach & Blood Donation Drive",
    "category": "guild",
    "categoryLabel": "🩺 Health & Wellness",
    "buildingId": "STUDENT-CENTER",
    "buildingName": "Student Center & Guild Canteen",
    "room": "Student Center Hall & Uganda Red Cross Pavilions",
    "startDate": "2026-10-17",
    "endDate": "2026-10-17",
    "dateFormatted": "Oct 17, 2026",
    "time": "08:00 AM - 05:00 PM",
    "organizer": "Kyambogo University Medical Services & Uganda Red Cross",
    "description": "Free university health outreach providing general consultations, optical screenings, dental checkups, and voluntary blood donation drive for students and staff.",
    "attendees": "All students, staff, and neighboring community members",
    "featured": true,
    "latitude": 0.348777,
    "longitude": 32.629508,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-ENGINEERING-SHOWCASE",
    "title": "Faculty of Engineering Innovations, Robotics & Capstone Expo",
    "category": "academic",
    "categoryLabel": "⚙️ Engineering Expo",
    "buildingId": "FACULTY-SCIENCE-ENGINEERING",
    "buildingName": "Faculty of Engineering & Science Complex",
    "room": "Mechanical Workshops & Mechatronics Lab Courtyard",
    "startDate": "2026-10-19",
    "endDate": "2026-10-20",
    "dateFormatted": "Oct 19 - 20, 2026",
    "time": "09:30 AM - 04:30 PM",
    "organizer": "Faculty of Engineering & Kyambogo Engineering Students Society (KESS)",
    "description": "Annual capstone exhibition presenting student engineering innovations: automated solar telemetry, micro-hydro systems, drone surveillance models, and renewable energy circuits.",
    "attendees": "Engineering students, innovators, UIPE representatives, and industry partners",
    "featured": true,
    "latitude": 0.348597,
    "longitude": 32.626483,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-ART-EXHIBITION",
    "title": "Block 29 Annual Fine Art, Graphics & Fashion Graduate Exhibition",
    "category": "cultural",
    "categoryLabel": "🎨 Art & Design Exhibition",
    "buildingId": "ART-DESIGN-BLOCK-29",
    "buildingName": "School of Art & Industrial Design (Block 29)",
    "room": "Main Art Gallery & Sculpture Courtyard",
    "startDate": "2026-10-22",
    "endDate": "2026-10-24",
    "dateFormatted": "Oct 22 - 24, 2026",
    "time": "10:00 AM - 06:00 PM",
    "organizer": "School of Art & Industrial Design Faculty Board",
    "description": "Vibrant graduate showcase of student contemporary paintings, ceramics, graphic branding concepts, textile sculptures, and fashion apparel.",
    "attendees": "Public, art collectors, design studios, alumni & students",
    "featured": false,
    "latitude": 0.347589,
    "longitude": 32.633824,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-GUILD-DEBATE",
    "title": "Guild Presidential Candidates Public Debate & Student Leadership Forum",
    "category": "guild",
    "categoryLabel": "🏛️ Student Leadership",
    "buildingId": "CENTRAL-TEACHING-FACILITY",
    "buildingName": "Central Teaching Facility (CTF)",
    "room": "CTF Large Lecture Theatre B & Main Quadrangle",
    "startDate": "2026-10-27",
    "endDate": "2026-10-27",
    "dateFormatted": "Oct 27, 2026",
    "time": "02:30 PM - 06:30 PM",
    "organizer": "Kyambogo University Guild Electoral Commission & Dean of Students",
    "description": "Official student guild presidential debate addressing tuition policies, hostel security, student healthcare welfare, and university academic facilities.",
    "attendees": "Kyambogo students, Guild Representative Council (GRC), and electoral observers",
    "featured": true,
    "latitude": 0.349258,
    "longitude": 32.630658,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-AGRIC-FIELD-DAY",
    "title": "Faculty of Agriculture Agro-Innovation & Climate Resilience Field Day",
    "category": "academic",
    "categoryLabel": "🌱 Agriculture & Research",
    "buildingId": "FACULTY-AGRICULTURE",
    "buildingName": "Faculty of Agriculture & Animal Sciences Complex",
    "room": "East End Demonstration Farm & Agro-Processing Labs",
    "startDate": "2026-10-30",
    "endDate": "2026-10-31",
    "dateFormatted": "Oct 30 - 31, 2026",
    "time": "09:00 AM - 04:00 PM",
    "organizer": "Faculty of Agriculture & Animal Sciences (Dean Assoc. Prof. Joseph Ssennyonga)",
    "description": "Practical showcase of hydroponic farming, indigenous cattle breed management, zero-waste bio-fertilizers, and sustainable post-harvest technologies.",
    "attendees": "Agriculture students, farmer cooperatives, researchers, and agronomists",
    "featured": false,
    "latitude": 0.345820,
    "longitude": 32.634850,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-CULTURE-GALA",
    "title": "Annual Cultural Gala & Inter-Ethnic Performing Arts Festival",
    "category": "cultural",
    "categoryLabel": "🎭 Cultural & Arts Gala",
    "buildingId": "PEACE-PARK",
    "buildingName": "Peace Park & Campus Shaded Lawns",
    "room": "Outdoor Amphitheatre & Shaded Lawns",
    "startDate": "2026-11-06",
    "endDate": "2026-11-07",
    "dateFormatted": "Nov 6 - 7, 2026",
    "time": "11:00 AM - 06:30 PM",
    "organizer": "Dean of Students & Guild Ministry of Culture",
    "description": "Celebration of rich African heritage and ethnic student associations representing Buganda, Ankole, Acholi, Teso, Busoga, West Nile, and international students.",
    "attendees": "University community, cultural enthusiasts, and visitors",
    "featured": true,
    "latitude": 0.350055,
    "longitude": 32.628929,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-EXAM-SEM1",
    "title": "End of Semester I Written & Practical University Examinations Period",
    "category": "academic",
    "categoryLabel": "📝 University Examinations",
    "buildingId": "CENTRAL-TEACHING-FACILITY",
    "buildingName": "Central Teaching Facility (CTF)",
    "room": "All Faculty Examination Halls, CTF Examination Blocks & Auditoriums",
    "startDate": "2026-11-23",
    "endDate": "2026-12-11",
    "dateFormatted": "Nov 23 - Dec 11, 2026",
    "time": "08:30 AM - 05:30 PM",
    "organizer": "Office of the Academic Registrar & Faculty Examination Boards",
    "description": "Centralized end-of-semester written examinations for all undergraduate and postgraduate programmes across Kyambogo University faculties.",
    "attendees": "All enrolled students with valid examination registration permits",
    "featured": true,
    "latitude": 0.349258,
    "longitude": 32.630658,
    "status": "upcoming"
  },
  {
    "eventId": "EVT-SEM2-REPORTING",
    "title": "Reporting of Continuing & Post-Graduate Students for Semester II",
    "category": "academic",
    "categoryLabel": "📚 Academic Calendar",
    "buildingId": "CENTRAL-TEACHING-FACILITY",
    "buildingName": "Central Teaching Facility (CTF)",
    "room": "Respective Faculty Deans' Offices & Departmental Coordination Rooms",
    "startDate": "2027-01-16",
    "endDate": "2027-01-17",
    "dateFormatted": "Jan 16 - 17, 2027",
    "time": "08:00 AM - 05:00 PM",
    "organizer": "Office of the Academic Registrar & Faculty Deans",
    "description": "Official reporting and online registration for continuing students for Semester II, Academic Year 2026/2027.",
    "attendees": "Continuing undergraduate and postgraduate students",
    "featured": true,
    "latitude": 0.349258,
    "longitude": 32.630658,
    "status": "upcoming"
  }
];

let raw = fs.readFileSync('campus-data.js', 'utf8');

// Replace export const buildings = [ ... ];
const bldgStart = raw.indexOf('export const buildings = [');
const bldgEnd = raw.indexOf('export function getBuildingById(id)');
if (bldgStart === -1 || bldgEnd === -1) {
  throw new Error("Could not find buildings block boundaries");
}

const newBldgStr = 'export const buildings = ' + JSON.stringify(updatedBuildings, null, 2) + ';\n\n';
raw = raw.substring(0, bldgStart) + newBldgStr + raw.substring(bldgEnd);

// Replace export const campusEvents = [ ... ];
const evtStart = raw.indexOf('export const campusEvents = [');
if (evtStart === -1) {
  throw new Error("Could not find campusEvents block start");
}

const syncCode = `
// Synchronize destination coordinates with authoritative Google Maps building markers
destinations.forEach(d => {
  if (d.buildingId) {
    const b = buildings.find(bldg => bldg.buildingId === d.buildingId);
    if (b) {
      d.latitude = b.latitude;
      d.longitude = b.longitude;
    }
  }
});

// Synchronize office coordinates with authoritative Google Maps building markers
campusOffices.forEach(o => {
  if (o.buildingId) {
    const b = buildings.find(bldg => bldg.buildingId === o.buildingId);
    if (b) {
      o.latitude = b.latitude;
      o.longitude = b.longitude;
    }
  }
});
`;

// Insert syncCode before export const campusEvents
const newEvtStr = syncCode + '\nexport const campusEvents = ' + JSON.stringify(updatedEvents, null, 2) + ';\n';
raw = raw.substring(0, evtStart) + newEvtStr;

fs.writeFileSync('campus-data.js', raw, 'utf8');
console.log('Successfully updated campus-data.js!');
