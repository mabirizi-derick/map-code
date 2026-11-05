// Kyambogo Digital Campus Map & Navigation System
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    buildings as defaultBuildings,
    faculties as defaultFaculties,
    departments as defaultDepartments,
    programmes as defaultProgrammes,
    destinations as defaultDestinations,
    campusOffices as defaultOffices,
    campusEvents as defaultEvents
} from './campus-data.js';
import QRCode from 'qrcode';

// Expose Leaflet globally
if (typeof window !== 'undefined') {
    window.L = L;
}

// Safe storage wrapper (never throws DOMException or SecurityError in sandboxed iframes)
const safeStorage = {
    getItem(key) {
        try {
            return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(key) : null;
        } catch (e) {
            return null;
        }
    },
    setItem(key, value) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, value);
        } catch (e) {}
    },
    removeItem(key) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
        } catch (e) {}
    }
};

let buildings = defaultBuildings.map(b => ({
    ...b,
    lat: Number(b.latitude),
    lng: Number(b.longitude)
}));
let buildingMarkers = buildings;
if (typeof window !== 'undefined') {
    window.buildings = buildings;
    window.buildingMarkers = buildings;
}

// Kyambogo Campus Geographical Bounds (Confined strictly to Kyambogo University)
const KYAMBOGO_BOUNDS = L.latLngBounds(
    [0.3400, 32.6200], // South-West corner (Banda, West End Pitch, sports grounds)
    [0.3585, 32.6390]  // North-East corner (East End Pitch, SBE, North Hall)
);

// 1. CREATE MAP (Safeguarded against re-initialization)
const mapContainerEl = document.getElementById('map');
if (mapContainerEl && mapContainerEl._leaflet_id) {
    mapContainerEl._leaflet_id = null;
}

const map = L.map('map', {
    zoomControl: false,
    minZoom: 15, // STRICT LIMIT: Prevents zooming out beyond Kyambogo campus!
    maxZoom: 19, // Allows high-detail building level & satellite zoom
    maxBounds: KYAMBOGO_BOUNDS, // Confines map strictly to Kyambogo region
    maxBoundsViscosity: 0.95    // Strong boundary resistance, map cannot be dragged away
}).setView([0.3485, 32.6295], 16.5);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// TILE LAYERS (Standard Map & High-Resolution Satellite Photography)
const streetTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | Kyambogo University',
    minZoom: 14,
    maxZoom: 19
}).addTo(map);

const satelliteTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google Satellite Imagery | Maxar, CNES/Airbus | Kyambogo Photographic View',
    minZoom: 14,
    maxZoom: 19
});

// Force map resize check to guarantee tiles render immediately
setTimeout(() => {
    map.invalidateSize();
}, 250);

window.addEventListener('resize', () => {
    map.invalidateSize();
});

// ==========================================================================
// MAP LAYER SWITCHER (STANDARD STREET & SATELLITE TILES)
// ==========================================================================
// Clean up any previously stored high contrast preference to preserve natural eye comfort
safeStorage.removeItem("kyambogo_high_contrast");
const isHighContrastActive = false;

// Purge any high contrast buttons from DOM
document.querySelectorAll("#layerHighContrastBtn, .layer-contrast-btn").forEach(el => el.remove());

const layerSwitcher = document.createElement("div");
layerSwitcher.className = "map-layer-switcher";
layerSwitcher.innerHTML = `
    <button class="layer-switch-btn active" id="layerStreetBtn" title="Standard Street Map">🗺️ Map</button>
    <button class="layer-switch-btn" id="layerSatBtn" title="High-Resolution Satellite View">🛰️ Satellite</button>
`;
document.body.appendChild(layerSwitcher);

const layerStreetBtn = document.getElementById("layerStreetBtn");
const layerSatBtn = document.getElementById("layerSatBtn");

layerStreetBtn.addEventListener("click", () => {
    if (map.hasLayer(satelliteTileLayer)) map.removeLayer(satelliteTileLayer);
    if (!map.hasLayer(streetTileLayer)) map.addLayer(streetTileLayer);
    layerStreetBtn.classList.add("active");
    layerSatBtn.classList.remove("active");
    showStatus("Switched to Standard Street Map");
});

layerSatBtn.addEventListener("click", () => {
    if (map.hasLayer(streetTileLayer)) map.removeLayer(streetTileLayer);
    if (!map.hasLayer(satelliteTileLayer)) map.addLayer(satelliteTileLayer);
    layerSatBtn.classList.add("active");
    layerStreetBtn.classList.remove("active");
    showStatus("Switched to High-Resolution Satellite View");
});

// Notification helper (replaces window.alert for clean iframe compatibility)
function showStatus(message, duration = 3500) {
    const statusEl = document.getElementById("locationStatus");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.display = "block";
    statusEl.style.opacity = "1";
    setTimeout(() => {
        statusEl.style.opacity = "0";
        setTimeout(() => {
            statusEl.style.display = "none";
        }, 300);
    }, duration);
}

// 2. CATEGORY ICONS & COLORS (Google Maps Style Pins)
const categoryConfig = {
    academic: {
        color: "#1a73e8", // Google Blue
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm0 8.55L4.54 9 12 4.95 19.46 9 12 11.55zM6 13.5v4c0 2.21 2.69 4 6 4s6-1.79 6-4v-4c-1.63 1.25-3.8 2-6 2s-4.37-.75-6-2z"/></svg>`
    },
    library: {
        color: "#673ab7", // Deep Purple
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>`
    },
    hall: {
        color: "#e65100", // Warm Amber/Orange
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`
    },
    hall_block: {
        color: "#e65100",
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`
    },
    cafeteria: {
        color: "#f57c00", // Orange
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>`
    },
    canteen: {
        color: "#f57c00",
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>`
    },
    cafe: {
        color: "#795548", // Coffee Brown
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/></svg>`
    },
    bank: {
        color: "#00897b", // Teal
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z"/></svg>`
    },
    worship: {
        color: "#5e35b1", // Purple
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 2l-5 5h3v8h4V7h3l-5-5zm-7 18h14v2H5v-2z"/></svg>`
    },
    sports: {
        color: "#2e7d32", // Forest Green
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`
    },
    laboratory: {
        color: "#0097a7", // Cyan Teal
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M20.8 18.4L15 9V4h1V2H8v2h1v5l-5.8 9.4c-.6.9 0 2.6 1.4 2.6h15c1.4 0 2-1.7 1.4-2.6zM6.5 19L11 11.8V4h2v7.8L17.5 19H6.5z"/></svg>`
    },
    administration: {
        color: "#455a64", // Slate Blue-Grey
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>`
    },
    gate: {
        color: "#c2185b", // Rich Crimson
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm-8 14H6V9h5v9zm7 0h-5V9h5v9z"/></svg>`
    },
    medical: {
        color: "#e53935", // Medical Red
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z"/></svg>`
    },
    landmark: {
        color: "#f59e0b", // Amber / Gold
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6v3H8v2h8v-2h-2v-3h6c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 13H4V4h16v11z"/></svg>`
    },
    service: {
        color: "#0284c7", // Cyan / Estates Blue
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`
    },
    police: {
        color: "#1e3a8a", // Deep Navy Police Blue
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>`
    }
};

// 3. CATEGORY MARKER GROUPS
const markerGroups = {
    academic: L.layerGroup(),
    library: L.layerGroup(),
    hall: L.layerGroup(),
    hall_block: L.layerGroup(),
    cafeteria: L.layerGroup(),
    canteen: L.layerGroup(),
    cafe: L.layerGroup(),
    bank: L.layerGroup(),
    worship: L.layerGroup(),
    sports: L.layerGroup(),
    laboratory: L.layerGroup(),
    administration: L.layerGroup(),
    gate: L.layerGroup(),
    medical: L.layerGroup(),
    landmark: L.layerGroup(),
    service: L.layerGroup(),
    police: L.layerGroup()
};

Object.values(markerGroups).forEach(group => {
    group.addTo(map);
});

// Create Google Maps style pin marker (neat, compact, organized)
function createCategoryMarker(building) {
    const config = categoryConfig[building.type] || {
        color: "#ea4335",
        svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><circle cx="12" cy="12" r="6"/></svg>`
    };

    const pinHtml = `
        <div class="gmaps-pin-container" title="${building.name}">
            <div class="gmaps-pin" style="--pin-color: ${config.color};">
                <div class="gmaps-pin-icon">
                    ${config.svg}
                </div>
            </div>
            <div class="gmaps-pin-dot"></div>
        </div>
    `;

    const markerIcon = L.divIcon({
        className: "gmaps-marker-wrapper",
        html: pinHtml,
        iconSize: [20, 28],
        iconAnchor: [10, 26],
        popupAnchor: [0, -26]
    });

    return L.marker([Number(building.latitude), Number(building.longitude)], {
        icon: markerIcon
    });
}

// Helper to verify that an event deadline or end date has not passed (auto-delete expired events)
function isEventActive(e) {
    if (!e) return false;
    const now = new Date();
    const todayStr = new Date(now.getTime() + (3 * 60 * 60 * 1000)).toISOString().split("T")[0]; // Kampala EAT (UTC+3)
    const deadline = e.endDate || e.startDate || e.date;
    if (!deadline) return true;
    return String(deadline).substring(0, 10) >= todayStr;
}

// Global state
let destinations = [];
let campusEventsList = defaultEvents.filter(isEventActive);
let userMarker = null;
let watchId = null;
let navigationActive = false;
let destination = null;
let routeLine = null;
let routeCasingLine = null;
let routeDestMarker = null;
let lastRouteLat = null;
let lastRouteLng = null;
const ROUTE_UPDATE_DISTANCE = 15; // meters
let isLiveWallpaperCollapsed = false;
let liveWallpaperInterval = null;
let wallpaperClockInterval = null;

function updateEventsCountBadges() {
    const b1 = document.getElementById("eventsCountBadge");
    if (b1) b1.textContent = campusEventsList.length;
    const b2 = document.getElementById("sidepanelEventsBadge");
    if (b2) b2.textContent = campusEventsList.length;
}

async function loadCampusEvents() {
    updateEventsCountBadges();
    if (typeof renderLiveEventsWallpaper === 'function') renderLiveEventsWallpaper();
    try {
        const response = await fetch("/api/events");
        if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.events)) {
                campusEventsList = data.events.filter(isEventActive);
                updateEventsCountBadges();
                if (typeof renderLiveEventsWallpaper === 'function') renderLiveEventsWallpaper();
            }
        }
    } catch (e) {
        campusEventsList = defaultEvents.filter(isEventActive);
        updateEventsCountBadges();
        if (typeof renderLiveEventsWallpaper === 'function') renderLiveEventsWallpaper();
    }
}

const redIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    className: "red-marker"
});

// Interactive User Location Pulse Marker (Google Maps Style Glowing Blue Dot with Concentric Radar Wave Animation)
const userLocationPulseIcon = L.divIcon({
    className: "user-location-marker-wrapper",
    html: `
        <div class="user-pulse-container" title="You are here (My Location)">
            <div class="user-pulse-ring-outer"></div>
            <div class="user-pulse-ring-inner"></div>
            <div class="user-location-dot">
                <div class="user-dot-inner"></div>
            </div>
        </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24]
});

let accuracyCircle = null;

// Sets or updates user location marker with smooth pulse animation and accuracy aura
function setUserLocationMarker(lat, lng, accuracy = 15, popupTitle = "You are here") {
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
        userMarker.setIcon(userLocationPulseIcon);
    } else {
        userMarker = L.marker([lat, lng], {
            icon: userLocationPulseIcon,
            zIndexOffset: 1200 // Keep above campus building markers
        }).addTo(map);
        userMarker.bindPopup(`<b>📍 ${popupTitle}</b><br>Accuracy: ~${Math.round(accuracy)}m`);
    }

    if (accuracy && typeof accuracy === "number") {
        const radius = Math.min(Math.max(accuracy, 10), 120);
        if (accuracyCircle) {
            accuracyCircle.setLatLng([lat, lng]);
            accuracyCircle.setRadius(radius);
        } else {
            accuracyCircle = L.circle([lat, lng], {
                radius: radius,
                color: "#1a73e8",
                fillColor: "#1a73e8",
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: "4, 6"
            }).addTo(map);
        }
    }
    return userMarker;
}

// Navigation handler
function selectDestination(name, lat, lng) {
    console.log("Selecting destination:", name, lat, lng);
    destination = {
        name: name,
        lat: Number(lat),
        lng: Number(lng),
        latitude: Number(lat),
        longitude: Number(lng)
    };

    navigationActive = true;
    lastRouteLat = null;
    lastRouteLng = null;

    if (userMarker) {
        getRoute();
        showStatus(`Navigating to ${name}...`);
    } else {
        showStatus(`Destination set: ${name}. Click "My Location" to start walking directions.`);
        document.getElementById("locationButton").click();
    }
}
window.selectDestination = selectDestination;

// Dedicated Kyambogo campus building image repository
// Includes verified real photography from Wikimedia Commons & Google Maps archives
const KYAMBOGO_CAMPUS_IMAGES = {
    // Real Kyambogo CTF (Central Teaching Facility) Complex
    ctf: "/images/real_kyambogo_ctf_1790505469681.jpg",
    // Real Kyambogo University Senate building photograph from Wikimedia Commons
    admin: "https://upload.wikimedia.org/wikipedia/commons/2/22/Kyambogo_University_Senate_building.png",
    // Real Kyambogo University Central Library building photograph from Wikimedia Commons
    library: "https://upload.wikimedia.org/wikipedia/commons/f/fe/Kyambogo_University_Central_library.jpg",
    // Real Kyambogo University Campus Mosque photograph from Wikimedia Commons
    mosque: "https://upload.wikimedia.org/wikipedia/commons/e/eb/Kyambogo_University_Mosque.jpg",
    // Real Kyambogo Faculty of Engineering workshop and lecture halls
    engineering: "/images/kyambogo_fac_eng_1790505486442.jpg",
    // Real Kyambogo student residential halls (Mandela, North, Pearl, Kulubya)
    hall: "/images/mandela_north_hall_1790505503318.jpg",
    // Kyambogo student cafeteria & dining
    dining: "/images/kyambogo_dining_hall_1790505119851.jpg",
    // Kyambogo Faculty of Science laboratories
    science: "/images/kyambogo_science_lab_1790505132698.jpg",
    // Kyambogo East End sports grounds & cricket oval
    sports: "/images/kyambogo_sports_ground_1790505144654.jpg",
    // Kyambogo St. Kakumba chapel / Our Lady of Africa
    chapel: "/images/kyambogo_chapel_church_1790505157000.jpg",
    // Faculty of Special Needs & Vocational Studies / School of Management
    vocational: "/images/kyambogo_vocational_1790505170080.jpg",
    // Real Google Maps branch photos for Stanbic Bank & Ecobank Kyambogo
    bank: "/images/stanbic_kyambogo_bank_1790506972641.jpg",
    // School of Computing and Information Science (SCIS)
    scis: "/images/kyambogo_scis_school_1790506986892.jpg"
};

// Fallback image helper if an external image encounters network error
window.handleImageError = function(imgElement, fallbackType) {
    if (!imgElement) return;
    if (imgElement.dataset.hasFailed) {
        // If first fallback fails, stop error loop and display Wikimedia Senate image
        imgElement.onerror = null;
        imgElement.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Kyambogo_University_Senate_building.png/640px-Kyambogo_University_Senate_building.png";
        return;
    }
    imgElement.dataset.hasFailed = "true";
    const localFallbacks = {
        admin: "/images/kyambogo_admin_block_1790505095777.jpg",
        library: "/images/kyambogo_main_library_1790505064981.jpg",
        mosque: "/images/kyambogo_chapel_church_1790505157000.jpg",
        bank: "/images/stanbic_kyambogo_bank_1790506972641.jpg"
    };
    imgElement.src = localFallbacks[fallbackType] || KYAMBOGO_CAMPUS_IMAGES.ctf;
};

// Building image helper with real Kyambogo landmark images
function getBuildingImageUrl(building) {
    if (building.imageUrl) return building.imageUrl;

    const bldgId = (building.buildingId || '').toUpperCase();
    const name = (building.name || '').toUpperCase();
    const type = building.type || 'academic';

    // Banks & ATMs (Stanbic Bank, Ecobank)
    if (type === 'bank' || bldgId.includes('BANK') || bldgId.includes('STANBIC') || bldgId.includes('ECOBANK') || name.includes('BANK') || name.includes('STANBIC') || name.includes('ECOBANK')) {
        return KYAMBOGO_CAMPUS_IMAGES.bank;
    }

    // School of Computing and Information Science (SCIS)
    if (bldgId.includes('SCIS') || name.includes('COMPUTING') || name.includes('SCIS')) {
        return KYAMBOGO_CAMPUS_IMAGES.scis;
    }

    // Central Teaching Facility (CTF)
    if (bldgId.includes('CENTRAL-TEACHING') || bldgId.includes('CTF') || name.includes('CENTRAL TEACHING') || name.includes('CTF')) {
        return KYAMBOGO_CAMPUS_IMAGES.ctf;
    }

    // Kyambogo Main Library
    if (bldgId.includes('LIBRARY') || type === 'library' || name.includes('LIBRARY')) {
        return KYAMBOGO_CAMPUS_IMAGES.library;
    }

    // Main Administration / Senate / Academic Registrar / Admissions
    if (bldgId.includes('ADMIN') || bldgId.includes('ADMISSION') || bldgId.includes('REGISTRAR') || bldgId.includes('SENATE') || name.includes('ADMINISTRATION') || name.includes('SENATE') || name.includes('REGISTRAR') || name.includes('BURSAR')) {
        return KYAMBOGO_CAMPUS_IMAGES.admin;
    }

    // Engineering & Technology Complex (Civil, Mechanical, Electrical)
    if (bldgId.includes('ENGINEERING') || bldgId.includes('CIVIL') || bldgId.includes('MECH') || bldgId.includes('ELECTRICAL') || name.includes('ENGINEERING') || name.includes('MECHANICAL') || name.includes('CIVIL')) {
        return KYAMBOGO_CAMPUS_IMAGES.engineering;
    }

    // Science Faculty & Laboratories
    if (bldgId.includes('SCIENCE') || bldgId.includes('LAB') || type === 'laboratory' || name.includes('SCIENCE') || name.includes('LABORATORY')) {
        return KYAMBOGO_CAMPUS_IMAGES.science;
    }

    // Student Halls of Residence (Mandela, North, Pearl, Nanziri, Kulubya)
    if (type === 'hall' || type === 'hall_block' || bldgId.includes('HALL') || name.includes('HALL') || name.includes('HOSTEL')) {
        return KYAMBOGO_CAMPUS_IMAGES.hall;
    }

    // Dining Halls, Cafeterias, Student Center
    if (type === 'cafeteria' || type === 'canteen' || type === 'cafe' || bldgId.includes('DINING') || bldgId.includes('CANTEEN') || name.includes('DINING') || name.includes('CAFETERIA')) {
        return KYAMBOGO_CAMPUS_IMAGES.dining;
    }

    // Sports Grounds, Cricket Oval, Football Pitch
    if (type === 'sports' || bldgId.includes('PITCH') || bldgId.includes('GROUND') || bldgId.includes('CRICKET') || name.includes('PITCH') || name.includes('GROUNDS') || name.includes('STADIUM')) {
        return KYAMBOGO_CAMPUS_IMAGES.sports;
    }

    // Campus Mosque vs Chapels (Kyambogo Mosque on Itek Rd vs St. Kakumba / Our Lady of Africa)
    if (bldgId.includes('MOSQUE') || name.includes('MOSQUE')) {
        return KYAMBOGO_CAMPUS_IMAGES.mosque;
    }
    if (type === 'worship' || bldgId.includes('CHAPEL') || bldgId.includes('CHURCH') || name.includes('CHAPEL') || name.includes('CHURCH')) {
        return KYAMBOGO_CAMPUS_IMAGES.chapel;
    }

    // Special Needs, Vocational Studies & Management
    if (bldgId.includes('VOCATIONAL') || bldgId.includes('SPECIAL-NEEDS') || bldgId.includes('MANAGEMENT') || bldgId.includes('SBE') || name.includes('SPECIAL NEEDS') || name.includes('VOCATIONAL') || name.includes('MANAGEMENT')) {
        return KYAMBOGO_CAMPUS_IMAGES.vocational;
    }

    // General academic default
    return KYAMBOGO_CAMPUS_IMAGES.ctf;
}

// 4. LOAD BUILDINGS
async function loadBuildingMarkers() {
    // 1. Immediately render bundled campus dataset so markers appear with zero delay
    renderBuildings(defaultBuildings);

    // 2. Fetch fresh live data from database if available
    try {
        const response = await fetch("/api/buildings");
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                const fetchedIds = new Set(data.map(b => b.buildingId));
                const merged = [...data, ...defaultBuildings.filter(b => !fetchedIds.has(b.buildingId))];
                renderBuildings(merged);
            }
        }
    } catch (error) {
        console.log("Using local campus dataset for buildings (offline/static mode)");
    }
}

function generateBuildingPopupHtml(building) {
    const imageUrl = getBuildingImageUrl(building);
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(building.name + " Kyambogo University Kampala")}`;

    // Find upcoming events taking place at this building or within its close proximity
    const bEvents = campusEventsList.filter(e => 
        e.buildingId === building.buildingId || 
        (building.lat && building.lng && Math.abs(e.latitude - building.lat) < 0.00015 && Math.abs(e.longitude - building.lng) < 0.00015)
    );

    let eventsHtml = '';
    if (bEvents.length > 0) {
        eventsHtml = `
            <div class="building-events-section">
                <div class="building-events-header">
                    <span>🎉 <b>Upcoming Events (${bEvents.length})</b></span>
                    <span style="font-size:10px; color:#7c3aed; cursor:pointer;" onclick="window.openCampusEventsDrawer()">All &rarr;</span>
                </div>
                ${bEvents.map(e => {
                    const d = new Date(e.startDate);
                    const month = isNaN(d.getTime()) ? 'OCT' : d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
                    const day = isNaN(d.getTime()) ? '📅' : d.getDate();
                    return `
                        <div class="building-event-mini-card" onclick="window.openEventDetails('${e.eventId}')" title="Tap for event agenda & directions">
                            <div class="mini-event-date-box">
                                <span class="mini-event-month">${month}</span>
                                <span class="mini-event-day">${day}</span>
                            </div>
                            <div class="mini-event-info">
                                <div class="mini-event-title">${e.title}</div>
                                <div class="mini-event-time">🕒 ${e.time} &bull; ${e.room}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } else {
        eventsHtml = `
            <div class="building-events-section">
                <div class="building-no-events-note">
                    <span>No events scheduled here today</span>
                    <a href="javascript:void(0)" class="view-all-events-link" onclick="window.openCampusEventsDrawer()">Browse All ↗</a>
                </div>
            </div>
        `;
    }

    return `
        <div class="building-popup">
            <div class="building-popup-image-container">
                <img src="${imageUrl}" alt="${building.name}" class="building-popup-image" loading="lazy" onerror="window.handleImageError(this, '${building.type}')" />
                <div class="gmaps-photo-badge">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="#ea4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    Google Maps Photo
                </div>
                <span class="building-popup-category-badge" style="background: ${categoryConfig[building.type]?.color || '#1a73e8'}">
                    ${building.type.replace('_', ' ')}
                </span>
            </div>
            <div class="building-popup-content">
                <strong>${building.name}</strong>
                ${building.description ? `<p class="building-popup-desc">${building.description}</p>` : ''}
                <a href="${gmapsUrl}" target="_blank" rel="noopener" class="gmaps-view-link">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="#1a73e8"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    Open on Google Maps ↗
                </a>

                ${eventsHtml}

                <button class="navigate-button" onclick="window.selectDestination('${building.name.replace(/'/g, "\\'")}', ${building.lat}, ${building.lng})">
                    🧭 Directions to Here
                </button>
            </div>
        </div>
    `;
}

// Variable to track which marker was explicitly pinned/clicked by the user
let pinnedMarker = null;
let popupCloseTimeout = null;

function setupMarkerHoverAndClick(marker) {
    marker.on("mouseover", function () {
        if (popupCloseTimeout) {
            clearTimeout(popupCloseTimeout);
            popupCloseTimeout = null;
        }
        if (!marker.isPopupOpen()) {
            marker.openPopup();
        }
    });

    marker.on("mouseout", function () {
        // Auto-close when mouse leaves the marker, unless user explicitly clicked it
        if (pinnedMarker !== marker) {
            popupCloseTimeout = setTimeout(() => {
                if (pinnedMarker !== marker && marker.isPopupOpen()) {
                    marker.closePopup();
                }
            }, 280);
        }
    });

    marker.on("click", function () {
        pinnedMarker = marker;
        if (popupCloseTimeout) {
            clearTimeout(popupCloseTimeout);
            popupCloseTimeout = null;
        }
        marker.openPopup();
    });

    marker.on("popupopen", function (e) {
        const popupEl = e.popup?.getElement();
        if (popupEl) {
            popupEl.addEventListener("mouseenter", () => {
                if (popupCloseTimeout) {
                    clearTimeout(popupCloseTimeout);
                    popupCloseTimeout = null;
                }
            });
            popupEl.addEventListener("mouseleave", () => {
                if (pinnedMarker !== marker) {
                    popupCloseTimeout = setTimeout(() => {
                        if (pinnedMarker !== marker && marker.isPopupOpen()) {
                            marker.closePopup();
                        }
                    }, 280);
                }
            });
        }
    });
}

function renderBuildings(sourceItems) {
    // Clear existing markers from all category groups
    Object.values(markerGroups).forEach(group => group.clearLayers());

    buildings = sourceItems.map(b => ({
        ...b,
        lat: Number(b.latitude),
        lng: Number(b.longitude)
    }));

        buildings.forEach(building => {
            if (building.latitude === null || building.longitude === null) return;
            const group = markerGroups[building.type] || markerGroups.academic;

            const marker = createCategoryMarker(building);
            building.marker = marker;

            // Bind dynamic popup function so latest events are always evaluated on click
            marker.bindPopup(() => generateBuildingPopupHtml(building), {
                maxWidth: 220,
                className: "custom-leaflet-popup"
            });

            // Restored mouse hover: popup auto opens on hover and auto disappears when mouse leaves
            setupMarkerHoverAndClick(marker);

            group.addLayer(marker);
        });

        console.log("Buildings loaded successfully:", buildings.length);
}

// 5. LOAD DESTINATIONS
let destinationMarkerLayers = [];

async function loadDestinationMarkers() {
    // 1. Immediately render bundled destinations
    renderDestinations(defaultDestinations);

    // 2. Fetch fresh live data from database if available
    try {
        const response = await fetch("/api/destinations");
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                const fetchedDestIds = new Set(data.map(d => d.destinationId));
                const mergedDest = [...data, ...defaultDestinations.filter(d => !fetchedDestIds.has(d.destinationId))];
                renderDestinations(mergedDest);
            }
        }
    } catch (error) {
        console.log("Using local campus dataset for destinations (offline/static mode)");
    }
}

function renderDestinations(sourceItems) {
    destinationMarkerLayers.forEach(layer => map.removeLayer(layer));
    destinationMarkerLayers = [];

    destinations = sourceItems.map(d => ({
        ...d,
        lat: Number(d.latitude),
        lng: Number(d.longitude)
    }));

    // Keep destination markers prepared for explicit department filtering or search,
    // but DO NOT add them to the default map view to eliminate clutter and overlapping pins.
    destinations.forEach(dest => {
        if (!dest.lat || !dest.lng) return;

        const destPinIcon = L.divIcon({
            className: "gmaps-marker-wrapper",
            html: `
                <div class="gmaps-pin-container office-dest" title="${dest.name}">
                    <div class="gmaps-pin" style="--pin-color: #0bce3b;">
                        <div class="gmaps-pin-icon">
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="white">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                            </svg>
                        </div>
                    </div>
                    <div class="gmaps-pin-dot"></div>
                </div>
            `,
            iconSize: [17, 24],
            iconAnchor: [8.5, 22],
            popupAnchor: [0, -22]
        });

        const marker = L.marker([dest.lat, dest.lng], {
            icon: destPinIcon
        });

        destinationMarkerLayers.push(marker);
        dest.marker = marker;
        const destImageUrl = getBuildingImageUrl({ buildingId: dest.buildingId, type: dest.type });
        const gmapsOfficeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest.name + " Kyambogo University")}`;

        marker.bindPopup(`
            <div class="building-popup">
                <div class="building-popup-image-container">
                    <img src="${destImageUrl}" alt="${dest.name}" class="building-popup-image" loading="lazy" onerror="this.style.display='none'" />
                    <div class="gmaps-photo-badge">
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="#ea4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                        Google Maps Photo
                    </div>
                    <span class="building-popup-category-badge" style="background: #0bce3b;">
                        Office
                    </span>
                </div>
                <div class="building-popup-body">
                    <h3 class="building-popup-title">${dest.name}</h3>
                    <div class="building-popup-address">
                        <span>📍</span>
                        <span>Kyambogo Campus • ${dest.buildingId || "Academic Block"}</span>
                    </div>
                    ${dest.description ? `<p class="building-popup-desc">${dest.description}</p>` : ''}
                    <div class="gmaps-action-buttons">
                        <button class="gmaps-action-btn primary" onclick="window.selectDestination('${dest.name.replace(/'/g, "\\'")}', ${dest.lat}, ${dest.lng})">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                            Directions
                        </button>
                        <a href="${gmapsOfficeUrl}" target="_blank" rel="noopener noreferrer" class="gmaps-action-btn secondary" style="text-decoration:none;">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="#ea4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                            Maps
                        </a>
                    </div>
                </div>
            </div>
        `, { maxWidth: 220, className: "custom-leaflet-popup" });

        setupMarkerHoverAndClick(marker);
    });
}

// -------------------------------------------------------------
// GOOGLE MAPS CATEGORY FILTER CHIPS LOGIC
// Filter markers so clicking a category turns off other markers!
// -------------------------------------------------------------
let currentFilterCategory = "all";

function matchesCategory(item, category) {
    if (category === "all") return true;

    const name = (item.name || "").toLowerCase();
    const id = (item.buildingId || item.destinationId || "").toLowerCase();
    const type = (item.type || "").toLowerCase();

    switch (category) {
        case "events":
            // Filter venues that have upcoming campus events
            return campusEventsList.some(e => 
                e.buildingId === item.buildingId || 
                (item.lat && item.lng && Math.abs(e.latitude - item.lat) < 0.00015 && Math.abs(e.longitude - item.lng) < 0.00015)
            );

        case "cafeterias":
            return ['cafeteria', 'canteen', 'cafe'].includes(type) ||
                   name.includes("dining") || name.includes("canteen") || 
                   name.includes("cafeteria") || name.includes("fruit") ||
                   id.includes("dining") || id.includes("canteen");

        case "banks":
            return type === "bank" || name.includes("bank") || name.includes("atm") ||
                   id.includes("stanbic") || id.includes("ecobank");

        case "faculties":
            // Faculty main complexes and Faculty Dean offices
            return name.includes("faculty") || id.includes("faculty") || 
                   (name.includes("dean") && !name.includes("school")) || 
                   id.includes("foe") || id.includes("foed") || id.includes("fsnr");

        case "departments":
            // Department offices & specific department engineering / academic teaching blocks
            return type === "department-office" || name.includes("department") ||
                   name.includes("hod") || name.includes("civil") || 
                   name.includes("mechanical") || name.includes("electrical") ||
                   name.includes("biomedical") || name.includes("mining") ||
                   name.includes("lands") || name.includes("teacher") ||
                   id.includes("civil") || id.includes("mechanical") || id.includes("lands") ||
                   id.includes("dept") || id.includes("office");

        case "schools":
            // Schools: SCIS, SOME, SBE, SAID, SOVS
            return name.includes("school of") || id.includes("school") ||
                   id.includes("scis") || id.includes("some") || 
                   id.includes("sbe") || id.includes("said") || id.includes("sovs") ||
                   name.includes("sbe") || name.includes("some") || name.includes("scis") ||
                   name.includes("said") || name.includes("sovs");

        case "halls":
            return type === "hall" || type === "hall_block" || 
                   name.includes("hall") || name.includes("hostel") ||
                   id.includes("hall") || id.includes("nanziri") || id.includes("mandela") ||
                   id.includes("kulubya") || id.includes("pearl") || id.includes("north-hall");

        case "religious":
            return type === "worship" || name.includes("chapel") || 
                   name.includes("mosque") || name.includes("church") || 
                   name.includes("chaplaincy") || id.includes("mosque") || 
                   id.includes("chapel") || id.includes("church");

        case "libraries":
            return type === "library" || name.includes("library") || id.includes("library");

        case "laboratories":
            return type === "laboratory" || name.includes("laboratory") || 
                   name.includes("lab") || name.includes("workshop") ||
                   id.includes("lab") || id.includes("science-lab");

        case "sports":
            return type === "sports" || name.includes("pitch") || 
                   name.includes("ground") || name.includes("sports") || 
                   name.includes("cricket") || id.includes("pitch");

        case "gates":
            return type === "gate" || name.includes("gate") || id.includes("gate") || name.includes("entrance");

        case "medical":
            return type === "medical" || name.includes("medical") || 
                   name.includes("health") || name.includes("clinic") || 
                   id.includes("medical") || id.includes("health");

        case "administration":
            return type === "administration" || name.includes("senate") || 
                   name.includes("admin") || name.includes("council") || 
                   name.includes("registrar") || name.includes("bursar") || 
                   id.includes("senate") || id.includes("admin") || id.includes("registrar");

        case "estates":
        case "services":
            return type === "service" || name.includes("estate") || 
                   name.includes("works") || id.includes("estate");

        case "police":
        case "security":
            return type === "police" || name.includes("police") || 
                   name.includes("security") || id.includes("police");

        case "landmarks":
            return type === "landmark" || name.includes("billboard") || 
                   name.includes("monument") || id.includes("billboard");

        default:
            return true;
    }
}

function applyCategoryFilter(categoryKey) {
    currentFilterCategory = categoryKey;

    // Update UI chips active state
    const chips = document.querySelectorAll(".gmaps-filter-chip");
    chips.forEach(chip => {
        if (chip.getAttribute("data-category") === categoryKey) {
            chip.classList.add("active");
            chip.setAttribute("aria-selected", "true");
        } else {
            chip.classList.remove("active");
            chip.setAttribute("aria-selected", "false");
        }
    });

    const visibleCoords = [];
    let visibleBuildings = 0;
    let visibleDestinations = 0;

    // Filter buildings: show matching, remove non-matching
    buildings.forEach(b => {
        if (!b.marker) return;
        const match = matchesCategory(b, categoryKey);
        if (match) {
            if (!map.hasLayer(b.marker)) {
                map.addLayer(b.marker);
            }
            if (b.lat && b.lng) {
                visibleCoords.push([b.lat, b.lng]);
                visibleBuildings++;
            }
        } else {
            if (map.hasLayer(b.marker)) {
                map.removeLayer(b.marker);
            }
        }
    });

    // Filter destinations: only show if specifically filtering by departments
    destinations.forEach(d => {
        if (!d.marker) return;
        const match = (categoryKey === "departments") && matchesCategory(d, categoryKey);

        if (match) {
            if (!map.hasLayer(d.marker)) {
                map.addLayer(d.marker);
            }
            if (d.lat && d.lng) {
                visibleCoords.push([d.lat, d.lng]);
                visibleDestinations++;
            }
        } else {
            if (map.hasLayer(d.marker)) {
                map.removeLayer(d.marker);
            }
        }
    });

    const totalVisible = visibleBuildings + visibleDestinations;

    // Zoom and pan smoothly to the filtered markers
    if (categoryKey !== "all" && visibleCoords.length > 0) {
        if (visibleCoords.length === 1) {
            map.setView(visibleCoords[0], 18, { animate: true });
        } else {
            const bounds = L.latLngBounds(visibleCoords);
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18, animate: true });
        }
        if (categoryKey === "events") {
            showStatus(`Showing ${totalVisible} campus venues with ${campusEventsList.length} upcoming events`);
        } else {
            showStatus(`Showing ${totalVisible} ${categoryKey.toUpperCase()} (other pins hidden)`);
        }
    } else if (categoryKey === "all") {
        map.setView([0.3490, 32.6290], 16.5, { animate: true });
        showStatus(`Showing all campus markers (${totalVisible} places)`);
    } else {
        showStatus(`No pins found for ${categoryKey}`);
    }
}

window.applyCategoryFilter = applyCategoryFilter;

function setupCategoryFilterChips() {
    const chips = document.querySelectorAll(".gmaps-filter-chip");
    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            const category = chip.getAttribute("data-category");
            if (category === "events") {
                window.openNoticeBoardModal();
                return;
            }
            if (currentFilterCategory === category && category !== "all") {
                applyCategoryFilter("all");
            } else {
                applyCategoryFilter(category);
            }
        });
    });
}

// Load campus markers, upcoming events and initialize filters
async function initializeCampusMapData() {
    await Promise.all([loadCampusEvents(), loadBuildingMarkers(), loadDestinationMarkers()]);
    setupCategoryFilterChips();
}

initializeCampusMapData();

// Coordinate Picker Tool (Interactive GPS Point Inspector & Destination Setter)
let coordPickerActive = false;
let coordPickerMarker = null;

// Haversine distance in meters helper
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// Reusable coordinate picker action
function pickCoordinateAt(rawLat, rawLng) {
    const lat = Number(rawLat).toFixed(6);
    const lng = Number(rawLng).toFixed(6);

    if (coordPickerMarker) map.removeLayer(coordPickerMarker);

    // Find closest Kyambogo landmark
    let closestBldg = null;
    let minDistance = Infinity;
    if (Array.isArray(buildings) && buildings.length > 0) {
        buildings.forEach(b => {
            const d = calculateDistanceMeters(Number(lat), Number(lng), b.latitude, b.longitude);
            if (d < minDistance) {
                minDistance = d;
                closestBldg = b;
            }
        });
    }

    const nearestLandmarkText = closestBldg 
        ? `~${minDistance}m from ${closestBldg.name}`
        : "Central Kyambogo Campus";

    const pickIcon = L.divIcon({
        className: "gmaps-marker-wrapper",
        html: `
            <div class="gmaps-pin-container" title="Picked GPS Coordinate">
                <div class="gmaps-pin" style="--pin-color: #0284c7; background: #0284c7;">
                    <div class="gmaps-pin-icon">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    </div>
                </div>
                <div class="gmaps-pin-dot"></div>
            </div>
        `,
        iconSize: [28, 38],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36]
    });

    coordPickerMarker = L.marker([lat, lng], { icon: pickIcon }).addTo(map);

    const coordText = `${lat}, ${lng}`;
    coordPickerMarker.bindPopup(`
        <div style="padding: 12px; font-family: system-ui, -apple-system, sans-serif; min-width: 240px; max-width: 290px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
                <span style="font-weight: 700; color: #0f172a; font-size: 13.5px;">📍 Picked Coordinate</span>
                <span style="font-size: 10.5px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 999px; font-weight: 700;">GPS Accurate</span>
            </div>
            <div style="background: #f8fafc; padding: 7px 10px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12.5px; color: #0f172a; margin-bottom: 8px; user-select: all; border: 1px solid #cbd5e1; font-weight: 600;">
                ${coordText}
            </div>
            <div style="font-size: 12px; color: #475569; margin-bottom: 10px; line-height: 1.35;">
                <b>Nearest Facility:</b> ${nearestLandmarkText}
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <button onclick="navigator.clipboard && navigator.clipboard.writeText('${coordText}').then(() => { this.innerText = '✅ Copied!'; setTimeout(() => this.innerText = '📋 Copy Coordinates', 2000); })" style="width: 100%; background: #0284c7; color: white; border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; transition: background 0.15s ease;">
                    📋 Copy Coordinates
                </button>
                <button onclick="window.walkToPickedCoordinate('${lat}', '${lng}', '${closestBldg ? closestBldg.name.replace(/'/g, "\\'") : 'Picked Point'}')" style="width: 100%; background: #059669; color: white; border: none; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px; transition: background 0.15s ease;">
                    🧭 Walk Here (Set Destination)
                </button>
            </div>
        </div>
    `, { maxWidth: 300 }).openPopup();

    showStatus(`🎯 Selected point: ${lat}, ${lng} (${nearestLandmarkText})`);
}

// Global helper for Walking to picked point
window.walkToPickedCoordinate = function(lat, lng, name) {
    destination = {
        name: `Picked Spot (${nearestBuildingText(lat, lng)})`,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        latitude: parseFloat(lat),
        longitude: parseFloat(lng)
    };
    navigationActive = true;
    lastRouteLat = null;
    lastRouteLng = null;
    getRoute();
    showStatus(`🧭 Shortest route generated to picked coordinate: ${lat}, ${lng}`);
    if (coordPickerMarker) coordPickerMarker.closePopup();
};

function nearestBuildingText(lat, lng) {
    if (!Array.isArray(buildings) || buildings.length === 0) return `${lat}, ${lng}`;
    let closest = buildings[0];
    let minDist = Infinity;
    buildings.forEach(b => {
        const d = calculateDistanceMeters(Number(lat), Number(lng), b.latitude, b.longitude);
        if (d < minDist) {
            minDist = d;
            closest = b;
        }
    });
    return `${closest.name} (~${minDist}m)`;
}

// Map click handler (closes panels and search results)
map.on("click", function (e) {
    pinnedMarker = null;
    const sidePanelEl = document.getElementById("sidepanel");
    if (sidePanelEl) sidePanelEl.style.left = "-320px";
    const searchResults = document.getElementById("searchResults");
    if (searchResults) searchResults.innerHTML = "";
});

// Map Right-Click handler (instantly picks coordinates at clicked point)
map.on("contextmenu", function (e) {
    pickCoordinateAt(e.latlng.lat, e.latlng.lng);
});

// ==========================================================================
// 6. KYAMBOGO CAMPUS SHORTEST ROUTE ENGINE (WALKWAY NETWORK + DIJKSTRA)
// ==========================================================================
// Comprehensive campus pedestrian walkway graph connecting all 49 buildings and courtyards
const CAMPUS_WALKWAYS = {
    nodes: {
        "SENATE": { id: "SENATE", name: "Senate Building Plaza", lat: 0.347766, lng: 32.631922 },
        "ADMISSIONS": { id: "ADMISSIONS", name: "Admissions & Academic Registrar", lat: 0.347991, lng: 32.631955 },
        "SCIS": { id: "SCIS", name: "SCIS Computing Block", lat: 0.347424, lng: 32.631801 },
        "STANBIC": { id: "STANBIC", name: "Stanbic / Commercial Hub", lat: 0.347449, lng: 32.631364 },
        "SOME": { id: "SOME", name: "SOME / NPT Management Block", lat: 0.346625, lng: 32.631234 },
        "RAC": { id: "RAC", name: "RAC Engineering Building", lat: 0.346485, lng: 32.631791 },
        "MANDELA": { id: "MANDELA", name: "Mandela & Nanziri Hall Gate", lat: 0.346474, lng: 32.630715 },
        "NANZIRI": { id: "NANZIRI", name: "Nanziri Upper Hall Walkway", lat: 0.347106, lng: 32.629866 },
        "BLUE_NILE": { id: "BLUE_NILE", name: "Blue Nile Hall Walkway", lat: 0.345861, lng: 32.630706 },
        "EAST_DINING": { id: "EAST_DINING", name: "East End Dining Hall", lat: 0.346002, lng: 32.631062 },
        "GRAD_GROUNDS": { id: "GRAD_GROUNDS", name: "Graduation Grounds & East Pitch", lat: 0.346561, lng: 32.633646 },
        "AGRICULTURE": { id: "AGRICULTURE", name: "Faculty of Agriculture", lat: 0.345820, lng: 32.634850 },
        "ART_DESIGN": { id: "ART_DESIGN", name: "School of Art (Block 29)", lat: 0.347589, lng: 32.633824 },
        "BARCLAYS_LIB": { id: "BARCLAYS_LIB", name: "Barclays East Library", lat: 0.348176, lng: 32.632912 },
        "LANGUAGES": { id: "LANGUAGES", name: "Languages & Humanities Walkway", lat: 0.348943, lng: 32.631501 },
        "ARTS_FACULTY": { id: "ARTS_FACULTY", name: "Faculty of Arts Building", lat: 0.347832, lng: 32.631358 },
        "PERFORMING_ARTS": { id: "PERFORMING_ARTS", name: "MDD Performing Arts Hall", lat: 0.347585, lng: 32.631074 },
        "FRUIT_CTR": { id: "FRUIT_CTR", name: "Fruit Centre & Campus Canteen", lat: 0.347054, lng: 32.631284 },

        // Central Academic Promenade & Peace Park
        "CTF_EAST": { id: "CTF_EAST", name: "CTF East Entrance Walkway", lat: 0.349100, lng: 32.631100 },
        "CTF": { id: "CTF", name: "Central Teaching Facility (CTF)", lat: 0.349258, lng: 32.630658 },
        "CENTRAL_PROMENADE": { id: "CENTRAL_PROMENADE", name: "Central Campus Promenade", lat: 0.349900, lng: 32.630750 },
        "LIBRARY": { id: "LIBRARY", name: "Central Library (Main Library)", lat: 0.350833, lng: 32.630817 },
        "ADMIN": { id: "ADMIN", name: "Main Administration Block (Council & VC)", lat: 0.350140, lng: 32.632892 },
        "ADMIN_WALK": { id: "ADMIN_WALK", name: "Admin - Library Promenade", lat: 0.350500, lng: 32.631800 },
        "PEACE_PARK": { id: "PEACE_PARK", name: "Peace Park & Shaded Quad", lat: 0.350055, lng: 32.628929 },
        "SCIENCE_LAB": { id: "SCIENCE_LAB", name: "Central Science Laboratory", lat: 0.350055, lng: 32.628929 },
        "STUDENT_CENTER": { id: "STUDENT_CENTER", name: "Student Center & Guild Canteen", lat: 0.348777, lng: 32.629508 },
        "CIVIL": { id: "CIVIL", name: "Civil Engineering Lecture Rooms", lat: 0.348566, lng: 32.629298 },
        "LANDS": { id: "LANDS", name: "Lands & Mining Engineering", lat: 0.349175, lng: 32.629137 },
        "ECOBANK": { id: "ECOBANK", name: "Ecobank Campus Branch", lat: 0.347569, lng: 32.630081 },
        "ST_KAKUMBA": { id: "ST_KAKUMBA", name: "St. Kakumba Chapel & Quad", lat: 0.347544, lng: 32.628720 },
        "SDA": { id: "SDA", name: "Seventh Day Adventist Chapel", lat: 0.346876, lng: 32.628494 },

        // West Campus (Engineering, Education, Health)
        "ENG_LABS": { id: "ENG_LABS", name: "Engineering Labs & Workshops", lat: 0.348340, lng: 32.628150 },
        "TECH_TEACHER": { id: "TECH_TEACHER", name: "Technical Teacher Block", lat: 0.350350, lng: 32.628100 },
        "WEST_DINING": { id: "WEST_DINING", name: "West End Dining Hall", lat: 0.350024, lng: 32.627933 },
        "SOVS": { id: "SOVS", name: "School of Vocational Studies (SOVS)", lat: 0.349506, lng: 32.627588 },
        "EDUCATION": { id: "EDUCATION", name: "Faculty of Education (FOED)", lat: 0.349403, lng: 32.626870 },
        "MECHANICAL": { id: "MECHANICAL", name: "Department of Mechanical Engineering", lat: 0.348222, lng: 32.626889 },
        "SCIENCE_ENG": { id: "SCIENCE_ENG", name: "Faculty of Engineering & Science Complex", lat: 0.348597, lng: 32.626483 },
        "WEST_MAIN_HALL": { id: "WEST_MAIN_HALL", name: "West End Main Lecture Hall", lat: 0.348261, lng: 32.625876 },
        "WEST_LIB": { id: "WEST_LIB", name: "West End Library", lat: 0.349056, lng: 32.625625 },
        "POLICE": { id: "POLICE", name: "Kyambogo University Police Station", lat: 0.350176, lng: 32.626101 },
        "ODL": { id: "ODL", name: "ODL e-Learning Centre", lat: 0.350215, lng: 32.626403 },
        "MEDICAL_CENTRE": { id: "MEDICAL_CENTRE", name: "Kyambogo University Medical Centre", lat: 0.347841, lng: 32.625019 },
        "WEST_CRICKET": { id: "WEST_CRICKET", name: "West End Sports Ground & Cricket Oval", lat: 0.345149, lng: 32.626334 },

        // North Campus (Halls, Special Needs, SBE)
        "MOSQUE": { id: "MOSQUE", name: "Kyambogo University Mosque", lat: 0.352416, lng: 32.626684 },
        "CATHOLIC": { id: "CATHOLIC", name: "Uganda Martyrs Catholic Chaplaincy", lat: 0.351599, lng: 32.627113 },
        "PEARL": { id: "PEARL", name: "Pearl Hall", lat: 0.351536, lng: 32.624990 },
        "KULUBYA": { id: "KULUBYA", name: "Kulubya Hall", lat: 0.351671, lng: 32.625778 },
        "NORTH_HALL": { id: "NORTH_HALL", name: "North Hall", lat: 0.353845, lng: 32.625583 },
        "FSNR": { id: "FSNR", name: "Faculty of Special Needs & Rehabilitation", lat: 0.353773, lng: 32.625336 },
        "SBE": { id: "SBE", name: "School of Built Environment (SBE)", lat: 0.355521, lng: 32.625269 }
    },
    edges: [
        ["SENATE", "ADMISSIONS"], ["SENATE", "SCIS"], ["SCIS", "SOME"], ["SOME", "RAC"],
        ["SOME", "MANDELA"], ["MANDELA", "NANZIRI"], ["NANZIRI", "BLUE_NILE"], ["NANZIRI", "EAST_DINING"],
        ["MANDELA", "EAST_DINING"], ["SOME", "STANBIC"], ["STANBIC", "FRUIT_CTR"], ["FRUIT_CTR", "PERFORMING_ARTS"],
        ["STANBIC", "PERFORMING_ARTS"], ["PERFORMING_ARTS", "ARTS_FACULTY"], ["ARTS_FACULTY", "SENATE"],
        ["ARTS_FACULTY", "LANGUAGES"], ["SENATE", "LANGUAGES"], ["ADMISSIONS", "LANGUAGES"],
        ["ADMISSIONS", "BARCLAYS_LIB"], ["BARCLAYS_LIB", "ART_DESIGN"], ["ART_DESIGN", "GRAD_GROUNDS"],
        ["GRAD_GROUNDS", "AGRICULTURE"], ["SOME", "GRAD_GROUNDS"], ["LANGUAGES", "CTF_EAST"],
        ["CTF_EAST", "CTF"], ["SENATE", "CTF_EAST"], ["PERFORMING_ARTS", "ECOBANK"],
        ["ECOBANK", "STUDENT_CENTER"], ["STANBIC", "ECOBANK"], ["CTF", "STUDENT_CENTER"],
        ["CTF", "CENTRAL_PROMENADE"], ["CENTRAL_PROMENADE", "LIBRARY"], ["CENTRAL_PROMENADE", "ADMIN_WALK"],
        ["ADMIN_WALK", "ADMIN"], ["LIBRARY", "ADMIN_WALK"], ["LANGUAGES", "ADMIN_WALK"],
        ["STUDENT_CENTER", "CIVIL"], ["CIVIL", "LANDS"], ["LANDS", "PEACE_PARK"],
        ["CTF", "PEACE_PARK"], ["CENTRAL_PROMENADE", "PEACE_PARK"], ["PEACE_PARK", "SCIENCE_LAB"],
        ["STUDENT_CENTER", "ST_KAKUMBA"], ["ST_KAKUMBA", "SDA"], ["SDA", "MANDELA"],
        ["CIVIL", "ENG_LABS"], ["ENG_LABS", "MECHANICAL"], ["MECHANICAL", "SCIENCE_ENG"],
        ["SCIENCE_LAB", "TECH_TEACHER"], ["TECH_TEACHER", "WEST_DINING"], ["WEST_DINING", "SOVS"],
        ["SOVS", "EDUCATION"], ["EDUCATION", "SCIENCE_ENG"], ["EDUCATION", "MECHANICAL"],
        ["SCIENCE_ENG", "WEST_MAIN_HALL"], ["WEST_MAIN_HALL", "WEST_LIB"], ["WEST_LIB", "POLICE"],
        ["POLICE", "ODL"], ["ODL", "EDUCATION"], ["WEST_LIB", "MEDICAL_CENTRE"],
        ["WEST_MAIN_HALL", "MEDICAL_CENTRE"], ["WEST_MAIN_HALL", "WEST_CRICKET"],
        ["ST_KAKUMBA", "WEST_MAIN_HALL"], ["POLICE", "KULUBYA"], ["ODL", "MOSQUE"],
        ["WEST_DINING", "CATHOLIC"], ["CATHOLIC", "MOSQUE"], ["MOSQUE", "KULUBYA"],
        ["KULUBYA", "PEARL"], ["PEARL", "NORTH_HALL"], ["KULUBYA", "NORTH_HALL"],
        ["NORTH_HALL", "FSNR"], ["FSNR", "SBE"]
    ]
};

// Build graph adjacency list
const campusWalkwayAdj = {};
for (const k of Object.keys(CAMPUS_WALKWAYS.nodes)) {
    campusWalkwayAdj[k] = [];
}
for (const [u, v] of CAMPUS_WALKWAYS.edges) {
    const n1 = CAMPUS_WALKWAYS.nodes[u];
    const n2 = CAMPUS_WALKWAYS.nodes[v];
    if (!n1 || !n2) continue;
    const w = calculateDistanceMeters(n1.lat, n1.lng, n2.lat, n2.lng);
    campusWalkwayAdj[u].push({ to: v, w });
    campusWalkwayAdj[v].push({ to: u, w });
}

// Snaps coordinates to closest campus walkway node
function findNearestWalkwayNode(lat, lng) {
    let closest = null;
    let minD = Infinity;
    for (const id of Object.keys(CAMPUS_WALKWAYS.nodes)) {
        const n = CAMPUS_WALKWAYS.nodes[id];
        const d = calculateDistanceMeters(lat, lng, n.lat, n.lng);
        if (d < minD) {
            minD = d;
            closest = n;
        }
    }
    return closest;
}

// Dijkstra shortest path algorithm on the campus network
function dijkstraCampusShortestPath(startId, endId) {
    const startNode = CAMPUS_WALKWAYS.nodes[startId];
    const endNode = CAMPUS_WALKWAYS.nodes[endId];
    if (!startNode || !endNode) return null;
    if (startId === endId) {
        return {
            path: [startId],
            names: [startNode.name],
            coords: [[startNode.lat, startNode.lng]],
            distance: 0
        };
    }

    const dist = {};
    const prev = {};
    const unvisited = new Set(Object.keys(CAMPUS_WALKWAYS.nodes));
    for (const id of unvisited) dist[id] = Infinity;
    dist[startId] = 0;

    while (unvisited.size > 0) {
        let u = null;
        let minD = Infinity;
        for (const id of unvisited) {
            if (dist[id] < minD) {
                minD = dist[id];
                u = id;
            }
        }
        if (u === null || u === endId) break;
        unvisited.delete(u);

        for (const edge of campusWalkwayAdj[u]) {
            if (!unvisited.has(edge.to)) continue;
            const alt = dist[u] + edge.w;
            if (alt < dist[edge.to]) {
                dist[edge.to] = alt;
                prev[edge.to] = u;
            }
        }
    }

    const path = [];
    let curr = endId;
    while (curr) {
        path.unshift(curr);
        curr = prev[curr];
    }

    const coords = path.map(id => [CAMPUS_WALKWAYS.nodes[id].lat, CAMPUS_WALKWAYS.nodes[id].lng]);
    const names = path.map(id => CAMPUS_WALKWAYS.nodes[id].name);
    return {
        path,
        names,
        coords,
        distance: Math.round(dist[endId])
    };
}

// Clear all active navigation lines, markers, and banners
function clearNavigation() {
    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }
    if (routeCasingLine) {
        map.removeLayer(routeCasingLine);
        routeCasingLine = null;
    }
    if (routeDestMarker) {
        map.removeLayer(routeDestMarker);
        routeDestMarker = null;
    }
    navigationActive = false;
    destination = null;
    lastRouteLat = null;
    lastRouteLng = null;

    const navBanner = document.getElementById("activeNavigationBanner");
    if (navBanner) navBanner.style.display = "none";
    showStatus("Navigation cleared.");
}
window.clearNavigation = clearNavigation;

// Wire up the banner cancel button
const cancelNavBannerBtn = document.getElementById("cancelNavBannerBtn");
if (cancelNavBannerBtn) {
    cancelNavBannerBtn.addEventListener("click", clearNavigation);
}

// 6. ROUTE CALCULATION (SHORTEST CAMPUS PATH GUARANTEED)
function getRoute() {
    if (!userMarker) {
        showStatus("Please turn on My Location first.");
        return;
    }

    if (!destination) {
        showStatus("Please select a destination or office first.");
        return;
    }

    const start = userMarker.getLatLng();
    const startLng = start.lng;
    const startLat = start.lat;
    const endLng = Number(destination.lng !== undefined ? destination.lng : destination.longitude);
    const endLat = Number(destination.lat !== undefined ? destination.lat : destination.latitude);
    const destName = destination.name || "Selected Destination";

    if (isNaN(endLat) || isNaN(endLng)) {
        console.error("Invalid destination coordinates:", destination);
        showStatus("Error: Destination coordinates not found.");
        return;
    }

    console.log("Computing shortest walking route from:", startLat, startLng, "to", endLat, endLng, `(${destName})`);

    const directDist = calculateDistanceMeters(startLat, startLng, endLat, endLng);

    // 1. Compute direct campus walkway shortest path (Dijkstra)
    let campusCoordinates = [];
    let campusDistance = 0;
    let campusWaypointsSummary = "Direct walkway";

    if (directDist <= 70) {
        // Very close / same courtyard: direct pedestrian walk
        campusCoordinates = [[startLat, startLng], [endLat, endLng]];
        campusDistance = Math.round(directDist);
        campusWaypointsSummary = "Direct courtyard path";
    } else {
        const startNode = findNearestWalkwayNode(startLat, startLng);
        const endNode = findNearestWalkwayNode(endLat, endLng);

        if (startNode && endNode) {
            const dijkstraResult = dijkstraCampusShortestPath(startNode.id, endNode.id);
            if (dijkstraResult && dijkstraResult.coords.length > 0) {
                const distToStartNode = calculateDistanceMeters(startLat, startLng, startNode.lat, startNode.lng);
                const distFromEndNode = calculateDistanceMeters(endNode.lat, endNode.lng, endLat, endLng);
                campusDistance = Math.round(distToStartNode + dijkstraResult.distance + distFromEndNode);
                campusCoordinates = [
                    [startLat, startLng],
                    ...dijkstraResult.coords,
                    [endLat, endLng]
                ];

                // Build readable turn-by-turn guidance
                if (dijkstraResult.names.length > 2) {
                    campusWaypointsSummary = `via ${dijkstraResult.names[1]} and ${dijkstraResult.names[dijkstraResult.names.length - 2]}`;
                } else if (dijkstraResult.names.length === 2) {
                    campusWaypointsSummary = `via ${dijkstraResult.names[0]}`;
                } else {
                    campusWaypointsSummary = `via ${startNode.name}`;
                }
            }
        }
    }

    // Fallback if campus network wasn't generated
    if (campusCoordinates.length === 0) {
        campusCoordinates = [[startLat, startLng], [endLat, endLng]];
        campusDistance = Math.round(directDist);
    }

    // 2. Query OSRM in parallel with timeout, and compare distances to guarantee shortest route
    const routeUrl = `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&continue_straight=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2400);

    fetch(routeUrl, { signal: controller.signal })
        .then(res => res.json())
        .then(data => {
            clearTimeout(timeoutId);
            let finalCoords = campusCoordinates;
            let finalDistance = campusDistance;
            let stepNotice = `Direct campus walkway ${campusWaypointsSummary}`;

            if (data && data.code === "Ok" && data.routes && data.routes.length > 0) {
                const osrmDist = Math.round(data.routes[0].distance);
                const osrmCoords = data.routes[0].geometry.coordinates.map(pt => [pt[1], pt[0]]);
                osrmCoords.push([endLat, endLng]);

                // STRICT SHORTEST ROUTE CHECK:
                // If OSRM distance is significantly longer than the campus footpath distance (OSRM took a long perimeter road detour),
                // choose our campus shortest footpath! If OSRM is truly shorter or equal, use OSRM.
                if (osrmDist > 0 && osrmDist < campusDistance * 0.98) {
                    finalCoords = osrmCoords;
                    finalDistance = osrmDist;
                    stepNotice = "Campus pedestrian path";
                    console.log(`[Route Engine] OSRM shortest: ${osrmDist}m vs campus ${campusDistance}m`);
                } else {
                    finalCoords = campusCoordinates;
                    finalDistance = campusDistance;
                    const savedDetour = osrmDist > campusDistance ? ` (Saves ${osrmDist - campusDistance}m perimeter detour)` : "";
                    stepNotice = `⚡ Optimal campus footpath ${campusWaypointsSummary}${savedDetour}`;
                    console.log(`[Route Engine] Campus Walkway shortest: ${campusDistance}m vs OSRM detour ${osrmDist}m`);
                }
            } else {
                console.log(`[Route Engine] Using campus walkway network: ${campusDistance}m`);
            }

            renderShortestRoute(finalCoords, finalDistance, destName, stepNotice);
        })
        .catch(err => {
            clearTimeout(timeoutId);
            console.log("[Route Engine] Fast fallback to campus walkway shortest path:", err.message);
            renderShortestRoute(campusCoordinates, campusDistance, destName, `⚡ Direct campus footpath ${campusWaypointsSummary}`);
        });
}

// Render the shortest route polyline and navigation status banner
function renderShortestRoute(routeCoordinates, distanceMeters, destName, stepNotice) {
    if (routeLine) map.removeLayer(routeLine);
    if (routeCasingLine) map.removeLayer(routeCasingLine);
    if (routeDestMarker) map.removeLayer(routeDestMarker);

    // 1. Clean white underlay casing for high-contrast visibility against roads & satellite imagery
    routeCasingLine = L.polyline(routeCoordinates, {
        color: '#ffffff',
        weight: 9,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);

    // 2. Vibrant Google Maps-style walking blue line
    routeLine = L.polyline(routeCoordinates, {
        color: '#1a73e8',
        weight: 5.5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);

    // 3. Destination target pin marker
    const endPoint = routeCoordinates[routeCoordinates.length - 1];
    const destIcon = L.divIcon({
        className: 'dest-target-marker-wrapper',
        html: `
            <div style="background:#dc2626; color:white; width:26px; height:26px; border-radius:50%; border:2.5px solid white; box-shadow:0 3px 10px rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800;">
                🎯
            </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

    routeDestMarker = L.marker(endPoint, { icon: destIcon }).addTo(map);
    routeDestMarker.bindPopup(`
        <div style="padding:6px; font-family:system-ui, sans-serif;">
            <b style="color:#0f172a; font-size:13px;">🎯 ${destName}</b>
            <div style="font-size:11.5px; color:#0369a1; font-weight:700; margin-top:3px;">
                🚶 Shortest Walk: ${distanceMeters}m (~${Math.max(1, Math.round(distanceMeters / 75))} min)
            </div>
        </div>
    `);

    // 4. Update the Active Navigation Banner
    const navBanner = document.getElementById("activeNavigationBanner");
    const navDestTitle = document.getElementById("navDestTitle");
    const navMetaDist = document.getElementById("navMetaDist");
    const navStepInstruction = document.getElementById("navStepInstruction");

    const walkMinutes = Math.max(1, Math.round(distanceMeters / 75)); // standard 4.5 km/h walking speed

    if (navDestTitle) navDestTitle.textContent = destName;
    if (navMetaDist) navMetaDist.textContent = `${distanceMeters}m • ~${walkMinutes} min walk`;
    if (navStepInstruction) navStepInstruction.textContent = stepNotice;
    if (navBanner) navBanner.style.display = "flex";

    map.fitBounds(routeLine.getBounds(), { padding: [55, 55], maxZoom: 18 });
    showStatus(`🚶 Shortest route: ${distanceMeters}m (~${walkMinutes} min) to ${destName}`);
}

// 7. LOCATION TRACKING
const locationButton = document.getElementById("locationButton");
const stopLocationButton = document.getElementById("stopLocationButton");

locationButton.addEventListener("click", function () {
    locationButton.style.display = "none";
    stopLocationButton.style.display = "inline-block";
    showStatus("Finding your location on campus...");

    if (!navigator.geolocation) {
        showStatus("Geolocation is not supported by your browser.");
        return;
    }

    if (watchId !== null) return;

    watchId = navigator.geolocation.watchPosition(
        function (position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            console.log("GPS Position:", lat, lng, "Accuracy:", accuracy);

            setUserLocationMarker(lat, lng, accuracy, "You are here");
            if (!navigationActive) {
                map.setView([lat, lng], 18, { animate: true });
            }

            if (navigationActive) {
                if (lastRouteLat === null) {
                    lastRouteLat = lat;
                    lastRouteLng = lng;
                    getRoute();
                } else {
                    const distance = map.distance([lastRouteLat, lastRouteLng], [lat, lng]);
                    if (distance >= ROUTE_UPDATE_DISTANCE) {
                        lastRouteLat = lat;
                        lastRouteLng = lng;
                        getRoute();
                    }
                }
            }

            showStatus("Location updated (Accuracy: ~" + Math.round(accuracy) + "m)");
        },
        function (error) {
            console.warn("GPS Notice:", error.message);
            // Default campus mock location if user denies GPS permission or testing from desktop
            if (!userMarker) {
                const campusCenterLat = 0.3476;
                const campusCenterLng = 32.6316;
                setUserLocationMarker(campusCenterLat, campusCenterLng, 25, "Campus Reference Point");
                map.setView([campusCenterLat, campusCenterLng], 18, { animate: true });
                showStatus("Using Kyambogo Central Campus as your reference location.");
            }
        },
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 10000
        }
    );
});

stopLocationButton.addEventListener("click", function () {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        stopLocationButton.style.display = "none";
        locationButton.style.display = "inline-block";
        if (accuracyCircle) {
            map.removeLayer(accuracyCircle);
            accuracyCircle = null;
        }
        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }
        showStatus("Location tracking stopped.");
    }
});

// 8. SHARE LOCATION
const shareLocationBtn = document.getElementById("shareLocation");
shareLocationBtn.addEventListener("click", function () {
    shareLocationBtn.textContent = "📍 Finding location...";

    function shareCoords(lat, lng) {
        const shareUrl = `${window.location.origin}${window.location.pathname}?lat=${lat}&lng=${lng}`;
        shareLocationBtn.textContent = "🔗 Share My Location";

        if (navigator.share) {
            navigator.share({
                title: "My Kyambogo Location",
                text: "Here is my location at Kyambogo University:",
                url: shareUrl
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(shareUrl)
                .then(() => {
                    showStatus("Location link copied! You can paste and share it.");
                })
                .catch(() => {
                    showStatus(`Share link: ${shareUrl}`);
                });
        }
    }

    if (userMarker) {
        const pt = userMarker.getLatLng();
        shareCoords(pt.lat, pt.lng);
    } else {
        navigator.geolocation.getCurrentPosition(
            pos => shareCoords(pos.coords.latitude, pos.coords.longitude),
            () => shareCoords(0.3476, 32.6316),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
});

// Check URL Params for Shared Location
const urlParams = new URLSearchParams(window.location.search);
const sharedLat = parseFloat(urlParams.get("lat"));
const sharedLng = parseFloat(urlParams.get("lng"));

if (!isNaN(sharedLat) && !isNaN(sharedLng)) {
    // Only center if coordinates are safely inside Kyambogo campus bounds!
    if (KYAMBOGO_BOUNDS.contains([sharedLat, sharedLng])) {
        L.marker([sharedLat, sharedLng], { icon: redIcon })
            .addTo(map)
            .bindPopup("<b>📍 Shared Campus Location</b><br><button class='navigate-button' onclick='window.selectDestination(\"Shared Location\", " + sharedLat + ", " + sharedLng + ")'>Navigate Here</button>")
            .openPopup();
        map.setView([sharedLat, sharedLng], 18);
        showStatus("Viewing shared campus location.");
    } else {
        console.warn("Shared location was outside campus boundaries; centering on Kyambogo University.");
        map.setView([0.3485, 32.6295], 16.8);
    }
}

// 9. SEARCH ENGINE: PROGRAMMES, DEPARTMENTS, FACULTIES, STAFF OFFICES & HODs
const searchBox = document.getElementById("searchBox");
const searchButton = document.getElementById("searchButton");
const searchResults = document.getElementById("searchResults");

searchBox.placeholder = "Search programme, department, staff office, or HOD...";

// Render comprehensive office and destination details card
async function showOfficeAndProgrammeDetails(programmeId, deptId, facId) {
    searchResults.innerHTML = `<div style="padding:15px; color:#475569;">🔍 Loading department offices and leadership...</div>`;

    try {
        let endpoint = "";
        if (programmeId) {
            endpoint = `/api/programmes/${encodeURIComponent(programmeId)}/destination`;
        } else if (deptId) {
            // Find any programme in this department or get department directly
            const deptRes = await fetch(`/api/departments`);
            const depts = await deptRes.json();
            const dept = depts.find(d => d.departmentId === deptId);
            const facRes = await fetch('/api/faculties');
            const facs = await facRes.json();
            const fac = facs.find(f => f.facultyId === dept?.facultyId);
            const offRes = await fetch(`/api/offices?departmentId=${encodeURIComponent(deptId)}`);
            const offices = await offRes.json();
            const bldg = buildings.find(b => b.buildingId === dept?.buildingId);

            renderOfficeCard({
                title: dept?.name || "Department Details",
                department: dept,
                faculty: fac,
                building: bldg || dept?.building,
                offices: {
                    hodOffice: offices.find(o => o.role === 'hod'),
                    staffOffice: offices.find(o => o.role === 'staff'),
                    deanOffice: null
                }
            });
            return;
        }

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error("Failed to fetch office details");
        const data = await response.json();

        renderOfficeCard({
            title: data.programme?.name,
            programme: data.programme,
            department: data.department,
            faculty: data.faculty,
            building: data.building,
            offices: data.offices
        });

    } catch (error) {
        console.warn("Using local campus dataset for office details:", error.message);
        const prog = defaultProgrammes.find(p => p.programmeId === programmeId);
        const dept = defaultDepartments.find(d => d.departmentId === (deptId || prog?.departmentId));
        const fac = defaultFaculties.find(f => f.facultyId === (facId || dept?.facultyId || prog?.facultyId));
        const bldg = (buildings && buildings.length ? buildings : defaultBuildings).find(b => b.buildingId === (dept?.buildingId || prog?.buildingId));
        const deptOffices = defaultOffices.filter(o => o.departmentId === (dept?.departmentId || deptId));
        const facOffices = defaultOffices.filter(o => o.facultyId === (fac?.facultyId || facId));

        renderOfficeCard({
            title: prog?.name || dept?.name || "Campus Location & Leadership",
            programme: prog,
            department: dept,
            faculty: fac,
            building: bldg || (dept ? { name: dept.name, buildingId: dept.buildingId, latitude: 0.3476, longitude: 32.6316 } : null),
            offices: {
                hodOffice: deptOffices.find(o => o.role === 'hod') || deptOffices[0],
                staffOffice: deptOffices.find(o => o.role === 'staff'),
                deanOffice: facOffices.find(o => o.role === 'dean')
            }
        });
    }
}

function renderOfficeCard(info) {
    const bldg = info.building || (info.department ? buildings.find(b => b.buildingId === info.department.buildingId) : null);
    const bldgName = bldg ? bldg.name : "Kyambogo Department Complex";
    const bldgLat = bldg ? bldg.lat || bldg.latitude : 0.3476;
    const bldgLng = bldg ? bldg.lng || bldg.longitude : 32.6316;

    // Center map on building
    map.setView([bldgLat, bldgLng], 18);
    if (bldg && bldg.marker) {
        bldg.marker.openPopup();
    }

    const hod = info.offices?.hodOffice;
    const dean = info.offices?.deanOffice;
    const staff = info.offices?.staffOffice;

    searchResults.innerHTML = `
        <div class="search-info-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <strong class="card-title">${info.title}</strong>
                <button id="closeSearchCard" style="border:none; background:none; font-size:18px; cursor:pointer; color:#64748b;">✕</button>
            </div>

            ${info.programme ? `
                <div class="office-field"><b>Programme Code:</b> ${info.programme.programmeId} (${info.programme.level || 'Degree'})</div>
            ` : ''}

            <div class="office-field"><b>Department:</b> ${info.department ? info.department.name : 'University Department'}</div>
            <div class="office-field"><b>Faculty / School:</b> ${info.faculty ? info.faculty.name : 'Kyambogo University'}</div>
            <div class="office-field">
                <b>Building Location:</b> 
                <button class="programme-building-button" onclick="map.setView([${bldgLat}, ${bldgLng}], 18)">
                    📍 ${bldgName}
                </button>
            </div>

            <!-- HEAD OF DEPARTMENT (HOD) OFFICE -->
            ${hod ? `
                <div class="office-highlight-box">
                    <div class="office-highlight-title">
                        <span>🏛️</span> Head of Department (HOD) Office
                    </div>
                    <div class="office-field"><b>Officer:</b> ${hod.officerName}</div>
                    <div class="office-field"><b>Room & Floor:</b> ${hod.room}, ${hod.floor} (${hod.buildingName})</div>
                    <div class="office-field"><b>Office Hours:</b> ${hod.officeHours}</div>
                    <div class="office-field"><b>Email:</b> <a href="mailto:${hod.email}" style="color:#1a56db;">${hod.email}</a></div>
                    <button class="office-nav-btn" onclick="window.selectDestination('${hod.title.replace(/'/g, "\\'")}', ${hod.latitude}, ${hod.longitude})">
                        🧭 Navigate to HOD Office
                    </button>
                </div>
            ` : ''}

            <!-- DEPARTMENT STAFF & LECTURERS OFFICE -->
            ${staff ? `
                <div class="office-highlight-box" style="background:#f0f9ff; border-color:#bae6fd;">
                    <div class="office-highlight-title" style="color:#0369a1;">
                        <span>👥</span> Department Staff & Consultation Office
                    </div>
                    <div class="office-field"><b>Staff Room:</b> ${staff.room}, ${staff.floor}</div>
                    <div class="office-field"><b>Services:</b> Coursework submission, lecturer consultation, timetables</div>
                    <button class="office-nav-btn secondary" onclick="window.selectDestination('${staff.title.replace(/'/g, "\\'")}', ${staff.latitude}, ${staff.longitude})">
                        🧭 Navigate to Staff Office
                    </button>
                </div>
            ` : ''}

            <!-- DEAN OF FACULTY OFFICE -->
            ${(dean || info.faculty) ? `
                <div class="office-highlight-box" style="background:#fefce8; border-color:#fef08a;">
                    <div class="office-highlight-title" style="color:#854d0e;">
                        <span>🎓</span> Faculty Dean's Office
                    </div>
                    <div class="office-field"><b>Dean:</b> ${dean ? dean.officerName : info.faculty.deanName}</div>
                    <div class="office-field"><b>Office Room:</b> ${dean ? dean.room : info.faculty.deanOfficeRoom}, ${dean ? dean.floor : info.faculty.deanOfficeFloor}</div>
                    <div class="office-field"><b>Contact:</b> ${dean ? dean.email : info.faculty.contactEmail}</div>
                    <button class="office-nav-btn secondary" style="background:#854d0e;" onclick="window.selectDestination('${(dean ? dean.title : 'Dean Office').replace(/'/g, "\\'")}', ${bldgLat}, ${bldgLng})">
                        🧭 Navigate to Dean's Office
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById("closeSearchCard")?.addEventListener("click", () => {
        searchResults.innerHTML = "";
    });
}

// Local Search Helper when API is not reachable or in static/offline deployment
function getLocalSearchResults(searchText) {
    const term = searchText.toLowerCase().trim();
    const matchedProgrammes = defaultProgrammes.filter(p => 
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.programmeId && p.programmeId.toLowerCase().includes(term)) ||
        (p.description && p.description.toLowerCase().includes(term))
    );
    const matchedDepts = defaultDepartments.filter(d => 
        (d.name && d.name.toLowerCase().includes(term)) ||
        (d.departmentId && d.departmentId.toLowerCase().includes(term)) ||
        (d.facultyName && d.facultyName.toLowerCase().includes(term))
    );
    const matchedFacs = defaultFaculties.filter(f => 
        (f.name && f.name.toLowerCase().includes(term)) ||
        (f.facultyId && f.facultyId.toLowerCase().includes(term))
    );
    const matchedOffices = defaultOffices.filter(o => 
        (o.title && o.title.toLowerCase().includes(term)) ||
        (o.officerName && o.officerName.toLowerCase().includes(term)) ||
        (o.buildingName && o.buildingName.toLowerCase().includes(term)) ||
        (o.role && o.role.toLowerCase().includes(term))
    );
    const matchedBuildings = (buildings && buildings.length ? buildings : defaultBuildings).filter(b => 
        (b.name && b.name.toLowerCase().includes(term)) ||
        (b.type && b.type.toLowerCase().includes(term)) ||
        (b.description && b.description.toLowerCase().includes(term))
    );
    const matchedEvents = campusEventsList.filter(e => 
        (e.title && e.title.toLowerCase().includes(term)) ||
        (e.category && e.category.toLowerCase().includes(term)) ||
        (e.buildingName && e.buildingName.toLowerCase().includes(term)) ||
        (e.organizer && e.organizer.toLowerCase().includes(term)) ||
        (e.description && e.description.toLowerCase().includes(term))
    );

    return {
        programmes: matchedProgrammes,
        departments: matchedDepts,
        faculties: matchedFacs,
        offices: matchedOffices,
        buildings: matchedBuildings,
        events: matchedEvents
    };
}

// Unified Search Function
async function performSearch(query) {
    const searchText = (query || searchBox.value).trim().toLowerCase();
    if (!searchText) {
        searchResults.innerHTML = "";
        return;
    }

    let data;
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchText)}`);
        if (response.ok) {
            data = await response.json();
        } else {
            data = getLocalSearchResults(searchText);
        }
    } catch (err) {
        data = getLocalSearchResults(searchText);
    }

    try {
        searchResults.innerHTML = "";

        const hasAny = (
            (data.events && data.events.length > 0) ||
            data.programmes.length > 0 ||
            data.departments.length > 0 ||
            data.faculties.length > 0 ||
            data.offices.length > 0 ||
            data.buildings.length > 0
        );

        if (!hasAny) {
            searchResults.innerHTML = `<div style="padding:14px; color:#64748b; font-size:14px;">No events, programmes, departments, staff offices or buildings found for "<b>${searchText}</b>".</div>`;
            return;
        }

        // 0. CAMPUS EVENTS
        if (data.events && data.events.length > 0) {
            const header = document.createElement("div");
            header.className = "search-section-header";
            header.style.color = "#7c3aed";
            header.textContent = `🎉 Upcoming Events (${data.events.length})`;
            searchResults.appendChild(header);

            data.events.forEach(evt => {
                const item = document.createElement("div");
                item.className = "search-item";
                item.innerHTML = `<span>🎉</span> <div><div>${evt.title}</div><small style="color:#7c3aed; font-weight:600;">${evt.dateFormatted || evt.startDate} &bull; ${evt.buildingName}</small></div>`;
                item.addEventListener("click", () => {
                    searchResults.innerHTML = "";
                    map.setView([evt.lat || evt.latitude, evt.lng || evt.longitude], 18);
                    window.openEventDetails(evt.eventId);
                });
                searchResults.appendChild(item);
            });
        }

        // 1. PROGRAMMES
        if (data.programmes.length > 0) {
            const header = document.createElement("div");
            header.className = "search-section-header";
            header.textContent = `🎓 Programmes (${data.programmes.length})`;
            searchResults.appendChild(header);

            data.programmes.forEach(prog => {
                const item = document.createElement("div");
                item.className = "search-item";
                item.innerHTML = `<span>🎓</span> <div><div>${prog.name}</div><small style="color:#64748b; font-weight:normal;">${prog.departmentName || prog.departmentId} &bull; ${prog.buildingName || ''}</small></div>`;
                item.addEventListener("click", () => {
                    showOfficeAndProgrammeDetails(prog.programmeId, prog.departmentId, prog.facultyId);
                });
                searchResults.appendChild(item);
            });
        }

        // 2. DEPARTMENTS & HOD OFFICES
        if (data.departments.length > 0) {
            const header = document.createElement("div");
            header.className = "search-section-header";
            header.textContent = `🏛️ Departments & HOD Offices (${data.departments.length})`;
            searchResults.appendChild(header);

            data.departments.forEach(dept => {
                const item = document.createElement("div");
                item.className = "search-item";
                item.innerHTML = `<span>🏛️</span> <div><div>Department of ${dept.name}</div><small style="color:#059669; font-weight:normal;">HOD: ${dept.hodName} (${dept.hodOfficeRoom})</small></div>`;
                item.addEventListener("click", () => {
                    showOfficeAndProgrammeDetails(null, dept.departmentId, dept.facultyId);
                });
                searchResults.appendChild(item);
            });
        }

        // 3. STAFF & LEADERSHIP OFFICES
        if (data.offices.length > 0) {
            const header = document.createElement("div");
            header.className = "search-section-header";
            header.textContent = `👤 Staff & Faculty Offices (${data.offices.length})`;
            searchResults.appendChild(header);

            data.offices.forEach(office => {
                const item = document.createElement("div");
                item.className = "search-item";
                item.innerHTML = `<span>📍</span> <div><div>${office.title}</div><small style="color:#64748b; font-weight:normal;">${office.officerName} &bull; ${office.room}, ${office.floor}</small></div>`;
                item.addEventListener("click", () => {
                    searchResults.innerHTML = "";
                    map.setView([office.latitude, office.longitude], 18);
                    selectDestination(office.title, office.latitude, office.longitude);
                });
                searchResults.appendChild(item);
            });
        }

        // 4. FACULTIES
        if (data.faculties.length > 0) {
            const header = document.createElement("div");
            header.className = "search-section-header";
            header.textContent = `🏢 Faculties & Schools (${data.faculties.length})`;
            searchResults.appendChild(header);

            data.faculties.forEach(fac => {
                const item = document.createElement("div");
                item.className = "search-item";
                item.innerHTML = `<span>🏢</span> <div><div>${fac.name}</div><small style="color:#64748b; font-weight:normal;">Dean: ${fac.deanName} (${fac.deanOfficeRoom})</small></div>`;
                item.addEventListener("click", () => {
                    if (fac.lat && fac.lng) {
                        map.setView([fac.lat, fac.lng], 18);
                        selectDestination(fac.name + " (Dean Office)", fac.lat, fac.lng);
                    }
                });
                searchResults.appendChild(item);
            });
        }

        // 5. BUILDINGS
        if (data.buildings.length > 0) {
            const header = document.createElement("div");
            header.className = "search-section-header";
            header.textContent = `📍 Campus Buildings (${data.buildings.length})`;
            searchResults.appendChild(header);

            data.buildings.forEach(bldg => {
                const item = document.createElement("div");
                item.className = "search-item";
                item.innerHTML = `<span>📍</span> <div><div>${bldg.name}</div><small style="color:#64748b; font-weight:normal;">Type: ${bldg.type}</small></div>`;
                item.addEventListener("click", () => {
                    map.setView([bldg.lat, bldg.lng], 18);
                    const match = buildings.find(b => b.buildingId === bldg.buildingId);
                    if (match && match.marker) match.marker.openPopup();
                    searchResults.innerHTML = "";
                });
                searchResults.appendChild(item);
            });
        }

    } catch (err) {
        console.error("Search error:", err);
    }
}

// Live search on input
let searchDebounce = null;
searchBox.addEventListener("input", function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        performSearch(searchBox.value);
    }, 200);
});

searchButton.addEventListener("click", function () {
    performSearch(searchBox.value);
});

searchBox.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        performSearch(searchBox.value);
    }
});

// 10. MENU & SIDE PANEL
const menuButton = document.createElement("button");
menuButton.id = "menuButton";
menuButton.setAttribute("title", "Campus Options Menu");
menuButton.innerHTML = `
    <span style="display:block; width:25px; height:4px; background:red; margin:3px auto; border-radius:5px;"></span>
    <span style="display:block; width:25px; height:4px; background:blue; margin:3px auto; border-radius:5px;"></span>
    <span style="display:block; width:25px; height:4px; background:red; margin:3px auto; border-radius:5px;"></span>
`;
menuButton.style.position = "absolute";
menuButton.style.top = "18px";
menuButton.style.left = "15px";
menuButton.style.zIndex = "2500";
menuButton.style.width = "48px";
menuButton.style.height = "48px";
menuButton.style.border = "none";
menuButton.style.borderRadius = "8px";
menuButton.style.background = "white";
menuButton.style.cursor = "pointer";
menuButton.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";

menuButton.style.display = "none"; // Replaced by clean left-end controls in header

const sidePanel = document.createElement("div");
sidePanel.id = "sidepanel";
sidePanel.innerHTML = `
    <div class="sidepanel-header-controls" style="justify-content: flex-end;">
        <button id="closePanel" style="font-size:24px; border:none; background:none; cursor:pointer; color:#475569;" aria-label="Close Side Panel">&times;</button>
    </div>
    
    <!-- MAIN OPTIONS VIEW -->
    <div id="sidePanelMainView">
        <h3 style="margin-top: 6px; margin-bottom: 12px; font-size: 19px; color: #0bce3b;">Kyambogo Campus</h3>

        <!-- Prominent About Creator Button -->
        <button id="panelAboutButton" class="panel-about-lead-btn" title="View details about Derick Mabirizi">
            <span class="p-lead-icon">👨‍💻</span>
            <div class="p-lead-text">
                <strong>About the Creator</strong>
                <span>Derick Mabirizi • Lead Engineer</span>
            </div>
            <span class="p-lead-arrow">➔</span>
        </button>

        <!-- Prominent Ask Campus AI Button in Sidepanel -->
        <button id="sidepanelAiGuideBtn" class="panel-ai-lead-btn" title="Ask Kyambogo AI about buildings, rooms, directions, and notices">
            <span class="p-lead-icon">✨</span>
            <div class="p-lead-text">
                <strong>Ask Campus AI Guide</strong>
                <span>Instant answers, venues & navigation</span>
            </div>
            <span class="p-lead-arrow">➔</span>
        </button>

        <!-- Prominent Install App / Play Store Button in Sidepanel -->
        <button id="sidepanelInstallAppBtn" class="sidepanel-install-lead-btn" title="Install Android/iOS App & Package for Google Play Store">
            <span class="p-lead-icon">📲</span>
            <div class="p-lead-text">
                <strong>Install App / Play Store</strong>
                <span>Android (.aab), iOS & PWA</span>
            </div>
            <span class="p-lead-arrow">➔</span>
        </button>

        <!-- Prominent Upcoming Events Button in Sidepanel -->
        <button id="panelEventsButton" class="panel-events-lead-btn" title="View all upcoming events on campus">
            <span class="p-lead-icon">🎉</span>
            <div class="p-lead-text">
                <strong>Upcoming Campus Events</strong>
                <span>Conferences, Matches, Hackathons (<span id="sidepanelEventsBadge">9</span>)</span>
            </div>
            <span class="p-lead-arrow">➔</span>
        </button>
        <button id="panelAddEventButton" class="panel-addevent-sub-btn" title="Post an upcoming campus event">
            <span>➕ Post Campus Event</span>
        </button>
        <button id="panelAdminApprovalsButton" class="panel-admin-approvals-btn" title="Admin Portal: Review and approve submitted campus events">
            <span>🛡️ Admin: Event Approvals</span>
        </button>

        <button id="panelLocationButton">⌖ My Location</button>
        <button id="buildingsName">▦ All Campus Buildings</button>
        <button id="officesPanelButton">🏛️ Staff & HOD Offices</button>
        <button id="navigationButton">➤ Clear & Reset Route</button>

        <div id="sharedLocationSection">
            <h3>🔗 Open Shared Location</h3>
            <input type="text" id="sharedLocationInput" placeholder="Paste shared location link...">
            <button id="viewSharedLocation">View Location</button>
        </div>

        <!-- Creator Mini Card in Sidepanel Footer -->
        <div class="sidepanel-creator-footer">
            <div class="creator-mini-top">
                <div class="creator-mini-avatar">DM</div>
                <div class="creator-mini-info">
                    <strong>Derick Mabirizi</strong>
                    <span>Creator & Developer</span>
                </div>
            </div>
            <p class="creator-mini-bio">Designed & developed to guide students, staff & visitors across Kyambogo University.</p>
            <div class="creator-mini-actions">
                <a href="https://mail.google.com/mail/?view=cm&fs=1&to=mabiriziderick26@gmail.com&su=Kyambogo%20Campus%20Map%20Feedback%20for%20Derick" target="_blank" rel="noopener noreferrer" class="creator-mini-chip">✉️ Email (Gmail)</a>
                <button id="sidepanelQuickAboutBtn" class="creator-mini-chip">📖 Full Profile</button>
            </div>
        </div>
    </div>

    <!-- DYNAMIC LIST VIEW (BUILDINGS OR OFFICES) -->
    <div id="sidePanelListView" style="display: none;">
        <div class="panel-list-header">
            <h4 class="panel-list-title" id="panelListTitle">List</h4>
            <button class="panel-back-btn" id="panelBackBtn">← Back</button>
        </div>
        <input type="text" id="panelFilterInput" class="panel-filter-input" placeholder="Filter items...">
        <div id="panelScrollList" class="panel-scroll-list"></div>
    </div>

    <!-- DEDICATED ABOUT CREATOR VIEW IN SIDEPANEL -->
    <div id="sidePanelAboutView" style="display: none;">
        <div class="panel-list-header">
            <h4 class="panel-list-title">👨‍💻 About Creator</h4>
            <button class="panel-back-btn" id="panelAboutBackBtn">← Back</button>
        </div>

        <div class="sidepanel-about-container">
            <div class="sidepanel-hero-card">
                <div class="sidepanel-avatar">DM</div>
                <h3>Derick Mabirizi</h3>
                <p class="sidepanel-role">Creator & Lead Software Engineer</p>
                <p class="sidepanel-sub">Kyambogo University Digital Campus Map Project</p>
                <span class="sidepanel-status-pill">🟢 Lead Developer</span>
            </div>

            <div class="sidepanel-chips-row">
                <a href="https://mail.google.com/mail/?view=cm&fs=1&to=mabiriziderick26@gmail.com&su=Kyambogo%20Campus%20Map%20Feedback%20for%20Derick" target="_blank" rel="noopener noreferrer" class="sp-chip sp-chip-email" title="Open Gmail composer">
                    ✉️ mabiriziderick26@gmail.com
                </a>
                <button id="sidepanelCopyEmailBtn" class="sp-chip">
                    📋 <span id="spCopyText">Copy Email</span>
                </button>
            </div>

            <div class="sidepanel-info-block">
                <h4>💡 Project Vision</h4>
                <p>Envisioned, engineered, and developed by <strong>Derick Mabirizi</strong> to solve navigation challenges across Kyambogo University hills. Whether you are a freshman finding lecture rooms, a visitor attending a conference, or a student seeking staff offices, this system provides direct walking directions and live GPS guidance.</p>
            </div>

            <div class="sidepanel-info-block">
                <h4>🚀 Engineering Highlights</h4>
                <ul class="sidepanel-feat-list">
                    <li><b>Walking Navigation:</b> Turn-by-turn routing between 60+ verified university landmarks.</li>
                    <li><b>Offline PWA:</b> Installable app on Android & iOS with cached map navigation.</li>
                    <li><b>Play Store Ready:</b> Trusted Web Activity (TWA) bundle architecture.</li>
                    <li><b>Offices Directory:</b> Direct locator for faculties, departments, and HODs.</li>
                </ul>
            </div>

            <div class="sidepanel-action-btns">
                <a href="https://mail.google.com/mail/?view=cm&fs=1&to=mabiriziderick26@gmail.com&su=Kyambogo%20Campus%20Map%20Feedback%20for%20Derick" target="_blank" rel="noopener noreferrer" class="sp-btn-primary">
                    ✉️ Open in Gmail / Send Message
                </a>
                <button id="sidepanelShareAppBtn" class="sp-btn-secondary">
                    🔗 Share Campus Map
                </button>
            </div>
        </div>
    </div>
`;
sidePanel.style.position = "absolute";
sidePanel.style.top = "0";
sidePanel.style.left = "-320px";
sidePanel.style.width = "320px";
sidePanel.style.height = "100%";
sidePanel.style.zIndex = "3000";
sidePanel.style.padding = "20px";
sidePanel.style.boxSizing = "border-box";
sidePanel.style.boxShadow = "2px 0 12px rgba(0,0,0,0.15)";
sidePanel.style.transition = "left 0.4s ease";
sidePanel.style.overflowY = "auto";

document.body.appendChild(sidePanel);

const sidePanelMainView = document.getElementById("sidePanelMainView");
const sidePanelListView = document.getElementById("sidePanelListView");
const sidePanelAboutView = document.getElementById("sidePanelAboutView");
const panelListTitle = document.getElementById("panelListTitle");
const panelBackBtn = document.getElementById("panelBackBtn");
const panelAboutBackBtn = document.getElementById("panelAboutBackBtn");
const panelFilterInput = document.getElementById("panelFilterInput");
const panelScrollList = document.getElementById("panelScrollList");
const panelAboutButton = document.getElementById("panelAboutButton");
const sidepanelQuickAboutBtn = document.getElementById("sidepanelQuickAboutBtn");

function showMainView() {
    if (sidePanelMainView) sidePanelMainView.style.display = "block";
    if (sidePanelListView) sidePanelListView.style.display = "none";
    if (sidePanelAboutView) sidePanelAboutView.style.display = "none";
}

function showListView(title) {
    if (sidePanelMainView) sidePanelMainView.style.display = "none";
    if (sidePanelListView) sidePanelListView.style.display = "block";
    if (sidePanelAboutView) sidePanelAboutView.style.display = "none";
    panelListTitle.textContent = title;
    panelFilterInput.value = "";
    panelFilterInput.focus();
}

function showAboutView() {
    if (sidePanelMainView) sidePanelMainView.style.display = "none";
    if (sidePanelListView) sidePanelListView.style.display = "none";
    if (sidePanelAboutView) sidePanelAboutView.style.display = "block";
    sidePanel.scrollTop = 0;
}

function openSidepanelWithAbout() {
    sidePanel.style.left = "0px";
    showAboutView();
}

panelBackBtn.addEventListener("click", showMainView);
if (panelAboutBackBtn) panelAboutBackBtn.addEventListener("click", showMainView);
if (panelAboutButton) panelAboutButton.addEventListener("click", showAboutView);
if (sidepanelQuickAboutBtn) sidepanelQuickAboutBtn.addEventListener("click", showAboutView);

// Menu Toggle (Single menu button at top)
const topMenuBtn = document.getElementById("topMenuBtn");

function toggleSidepanel() {
    if (sidePanel.style.left === "0px") {
        sidePanel.style.left = "-320px";
    } else {
        sidePanel.style.left = "0px";
        showMainView();
    }
}

if (topMenuBtn) {
    topMenuBtn.addEventListener("click", toggleSidepanel);
}

// Top Bar AI Guide button
const topAiGuideBtn = document.getElementById("topAiGuideBtn");
if (topAiGuideBtn) {
    topAiGuideBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.openCampusAiModal === "function") {
            window.openCampusAiModal();
        } else {
            const m = document.getElementById("campusAiModal");
            if (m) {
                m.style.display = "flex";
                m.style.visibility = "visible";
                m.style.opacity = "1";
            }
        }
    });
}

// Sidepanel AI Guide button
const sidepanelAiGuideBtn = document.getElementById("sidepanelAiGuideBtn");
if (sidepanelAiGuideBtn) {
    sidepanelAiGuideBtn.addEventListener("click", () => {
        sidePanel.style.left = "-320px";
        window.openCampusAiModal();
    });
}

// Sidepanel About Copy Email & Share handlers
const sidepanelCopyEmailBtn = document.getElementById("sidepanelCopyEmailBtn");
const spCopyText = document.getElementById("spCopyText");
if (sidepanelCopyEmailBtn) {
    sidepanelCopyEmailBtn.addEventListener("click", () => {
        const email = "mabiriziderick26@gmail.com";
        if (navigator.clipboard) {
            navigator.clipboard.writeText(email).then(() => {
                if (spCopyText) spCopyText.innerText = "Copied!";
                showStatus("Derick's email copied to clipboard!");
                setTimeout(() => {
                    if (spCopyText) spCopyText.innerText = "Copy Email";
                }, 2500);
            });
        }
    });
}

const sidepanelShareAppBtn = document.getElementById("sidepanelShareAppBtn");
if (sidepanelShareAppBtn) {
    sidepanelShareAppBtn.addEventListener("click", () => {
        const shareData = {
            title: "Kyambogo Digital Campus Map",
            text: "Explore Kyambogo University campus map created by Derick Mabirizi:",
            url: window.location.href
        };
        if (navigator.share) {
            navigator.share(shareData).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(window.location.href).then(() => {
                showStatus("Campus map link copied to clipboard!");
            });
        }
    });
}

document.getElementById("closePanel").addEventListener("click", function () {
    sidePanel.style.left = "-320px";
});

document.getElementById("panelLocationButton").addEventListener("click", function () {
    sidePanel.style.left = "-320px";
    locationButton.click();
});

// Render All Campus Buildings List in Side Panel
function renderBuildingsList(filterText = "") {
    const filter = filterText.toLowerCase().trim();
    panelScrollList.innerHTML = "";

    const filtered = buildings.filter(b => 
        b.name.toLowerCase().includes(filter) ||
        (b.type && b.type.toLowerCase().includes(filter)) ||
        (b.description && b.description.toLowerCase().includes(filter))
    );

    if (filtered.length === 0) {
        panelScrollList.innerHTML = `<div style="padding:15px; color:#64748b; font-size:13px;">No buildings match "${filterText}".</div>`;
        return;
    }

    filtered.forEach(b => {
        const item = document.createElement("div");
        item.className = "panel-item-card";
        const bldgImg = getBuildingImageUrl(b);

        item.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <img src="${bldgImg}" alt="${b.name}" style="width:48px; height:48px; border-radius:6px; object-fit:cover; flex-shrink:0; background:#f1f5f9;" onerror="this.style.display='none'" />
                <div style="flex:1; min-width:0;">
                    <div class="panel-item-header">
                        <span class="panel-item-name">${b.name}</span>
                        <span class="panel-item-badge">${b.type}</span>
                    </div>
                    ${b.description ? `<div class="panel-item-desc" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.description}</div>` : ''}
                    <div class="panel-item-location">📍 Tap to view on map</div>
                </div>
            </div>
        `;

        item.addEventListener("click", () => {
            sidePanel.style.left = "-320px";
            map.setView([b.lat, b.lng], 18);
            if (b.marker) {
                b.marker.openPopup();
            }
            showStatus(`Centered on ${b.name}`);
        });

        panelScrollList.appendChild(item);
    });
}

// Active button for All Campus Buildings
document.getElementById("buildingsName").addEventListener("click", function () {
    showListView(`▦ Campus Buildings (${buildings.length})`);
    renderBuildingsList();
    panelFilterInput.oninput = () => renderBuildingsList(panelFilterInput.value);
});

// Render Staff & HOD Offices List in Side Panel
let cachedOffices = defaultOffices || [];
async function renderOfficesList(filterText = "") {
    const filter = filterText.toLowerCase().trim();

    if (!cachedOffices || cachedOffices.length === 0) {
        cachedOffices = defaultOffices || [];
    }

    try {
        const res = await fetch("/api/offices");
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                cachedOffices = data;
            }
        }
    } catch (e) {
        // Fallback to bundled dataset
        if (!cachedOffices || cachedOffices.length === 0) {
            cachedOffices = defaultOffices;
        }
    }

    panelScrollList.innerHTML = "";

    const filtered = cachedOffices.filter(o => 
        o.title.toLowerCase().includes(filter) ||
        o.officerName.toLowerCase().includes(filter) ||
        o.buildingName.toLowerCase().includes(filter) ||
        o.room.toLowerCase().includes(filter) ||
        (o.role && o.role.toLowerCase().includes(filter))
    );

    if (filtered.length === 0) {
        panelScrollList.innerHTML = `<div style="padding:15px; color:#64748b; font-size:13px;">No offices match "${filterText}".</div>`;
        return;
    }

    filtered.forEach(o => {
        const item = document.createElement("div");
        item.className = "panel-item-card";
        const roleLabel = o.role === 'hod' ? 'HOD' : (o.role === 'dean' ? 'Dean' : 'Staff');

        item.innerHTML = `
            <div class="panel-item-header">
                <span class="panel-item-name">${o.title}</span>
                <span class="panel-item-badge" style="background:#dcfce7; color:#166534;">${roleLabel}</span>
            </div>
            <div class="panel-item-desc"><b>Officer:</b> ${o.officerName}</div>
            <div class="panel-item-desc"><b>Location:</b> ${o.room}, ${o.floor} (${o.buildingName})</div>
            <div class="panel-item-location">🧭 Tap to view and navigate</div>
        `;

        item.addEventListener("click", () => {
            sidePanel.style.left = "-320px";
            map.setView([o.latitude, o.longitude], 18);
            selectDestination(o.title, o.latitude, o.longitude);
            showStatus(`Selected: ${o.title}`);
        });

        panelScrollList.appendChild(item);
    });
}

// Active button for Staff & HOD Offices
document.getElementById("officesPanelButton").addEventListener("click", async function () {
    showListView(`🏛️ Staff & HOD Offices`);
    await renderOfficesList();
    panelFilterInput.oninput = () => renderOfficesList(panelFilterInput.value);
});

// Render All Upcoming Campus Events in Side Panel
function renderEventsList(filterText = "") {
    const filter = filterText.toLowerCase().trim();
    panelScrollList.innerHTML = "";

    // Strictly enforce active upcoming events (auto-purge expired)
    const activeUpcoming = campusEventsList.filter(isEventActive);

    // Prepend Auto-Pruning Notice Banner
    const noticeBanner = document.createElement("div");
    noticeBanner.style.cssText = "margin-bottom:12px; padding:8px 12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; font-size:11.5px; color:#166534; display:flex; align-items:center; gap:8px;";
    noticeBanner.innerHTML = `<span>🛡️</span><span><strong>Notice Board Auto-Pruning:</strong> Events that have concluded or passed deadline are automatically deleted.</span>`;
    panelScrollList.appendChild(noticeBanner);

    const filtered = activeUpcoming.filter(e => 
        e.title.toLowerCase().includes(filter) ||
        (e.category && e.category.toLowerCase().includes(filter)) ||
        (e.categoryLabel && e.categoryLabel.toLowerCase().includes(filter)) ||
        (e.buildingName && e.buildingName.toLowerCase().includes(filter)) ||
        (e.room && e.room.toLowerCase().includes(filter)) ||
        (e.organizer && e.organizer.toLowerCase().includes(filter)) ||
        (e.description && e.description.toLowerCase().includes(filter))
    );

    if (filtered.length === 0) {
        panelScrollList.innerHTML = `<div style="padding:20px; text-align:center; color:#64748b; font-size:13px;">No campus events match "${filterText}".</div>`;
        return;
    }

    filtered.forEach(e => {
        const item = document.createElement("div");
        item.className = "panel-item-card";
        item.style.borderLeft = "3.5px solid #7c3aed";
        item.innerHTML = `
            <div class="panel-item-header">
                <span class="panel-item-name" style="color:#1e1b4b;">${e.title}</span>
                <span class="panel-item-badge" style="background:#ede9fe; color:#6d28d9;">${e.categoryLabel || e.category}</span>
            </div>
            <div class="panel-item-desc" style="color:#6d28d9; font-weight:700;">📅 ${e.dateFormatted || e.startDate} &bull; 🕒 ${e.time}</div>
            <div class="panel-item-desc"><b>📍 Venue:</b> ${e.buildingName} (${e.room || 'Campus Location'})</div>
            <div class="panel-item-desc" style="font-size:11.5px; color:#64748b;">${e.description}</div>
            <div style="display:flex; gap:6px; margin-top:10px;">
                <button class="creator-quick-chip loc-chip" style="cursor:pointer; flex:1; justify-content:center; padding:5px 8px; font-size:11.5px;" onclick="event.stopPropagation(); window.openEventDetails('${e.eventId}')">📖 Agenda</button>
                <button class="creator-quick-chip copy-chip" style="cursor:pointer; flex:1; justify-content:center; background:#0bce3b; color:white; border:none; padding:5px 8px; font-size:11.5px;" onclick="event.stopPropagation(); window.navigateToEvent('${e.eventId}')">🧭 Walk Here</button>
            </div>
        `;

        item.addEventListener("click", () => {
            sidePanel.style.left = "-320px";
            map.setView([e.latitude, e.longitude], 18);
            const bldg = buildings.find(b => b.buildingId === e.buildingId);
            if (bldg && bldg.marker) {
                bldg.marker.openPopup();
            }
            showStatus(`Centered on event venue: ${e.buildingName}`);
        });

        panelScrollList.appendChild(item);
    });
}

// Sidepanel Upcoming Events Button
const panelEventsButton = document.getElementById("panelEventsButton");
if (panelEventsButton) {
    panelEventsButton.addEventListener("click", function () {
        showListView("🎉 Upcoming Campus Events");
        renderEventsList();
        panelFilterInput.oninput = () => renderEventsList(panelFilterInput.value);
    });
}

// Sidepanel Post Event Button
const panelAddEventButton = document.getElementById("panelAddEventButton");
if (panelAddEventButton) {
    panelAddEventButton.addEventListener("click", function () {
        sidePanel.style.left = "-320px";
        window.openAddEventModal();
    });
}

// Window helpers for Events
window.openEventDetails = function(eventId) {
    const event = campusEventsList.find(e => e.eventId === eventId);
    if (!event) return;

    const modal = document.getElementById("eventModal");
    if (!modal) return;

    document.getElementById("eventModalCategory").textContent = event.categoryLabel || (event.category ? event.category.toUpperCase() : "CAMPUS EVENT");
    document.getElementById("eventModalTitle").textContent = event.title;
    document.getElementById("eventModalDate").textContent = `📅 ${event.dateFormatted || event.startDate}`;
    document.getElementById("eventModalTime").textContent = `🕒 ${event.time}`;
    document.getElementById("eventModalBuildingName").textContent = event.buildingName;
    document.getElementById("eventModalRoom").textContent = event.room || "Campus Location";
    document.getElementById("eventModalDescription").textContent = event.description;
    document.getElementById("eventModalOrganizer").textContent = event.organizer || "Kyambogo University";
    document.getElementById("eventModalAttendees").textContent = event.attendees || "Open to all students & staff";

    // Google Calendar template link
    const gCalTitle = encodeURIComponent(event.title + " @ Kyambogo University");
    const gCalDetails = encodeURIComponent(`${event.description}\n\nVenue: ${event.buildingName} (${event.room})\nHost: ${event.organizer}`);
    const gCalLocation = encodeURIComponent(`${event.buildingName}, Kyambogo University Kampala`);
    const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gCalTitle}&details=${gCalDetails}&location=${gCalLocation}`;
    
    const calBtn = document.getElementById("eventModalCalendarBtn");
    if (calBtn) calBtn.href = calUrl;

    const navBtn = document.getElementById("eventModalNavigateBtn");
    if (navBtn) {
        navBtn.onclick = () => {
            modal.style.display = "none";
            selectDestination(event.title + " (" + (event.room || event.buildingName) + ")", event.latitude, event.longitude);
            showStatus(`Navigating to event: ${event.title}`);
        };
    }

    const mapBtn = document.getElementById("eventModalShowMapBtn");
    if (mapBtn) {
        mapBtn.onclick = () => {
            modal.style.display = "none";
            map.setView([event.latitude, event.longitude], 18);
            const bldg = buildings.find(b => b.buildingId === event.buildingId);
            if (bldg && bldg.marker) {
                bldg.marker.openPopup();
            }
            showStatus(`Showing event venue: ${event.buildingName}`);
        };
    }

    modal.style.display = "flex";
};

window.navigateToEvent = function(eventId) {
    const event = campusEventsList.find(e => e.eventId === eventId);
    if (!event) return;
    const sidePanelEl = document.getElementById("sidepanel");
    if (sidePanelEl) sidePanelEl.style.left = "-320px";
    selectDestination(event.title + " (" + (event.room || event.buildingName) + ")", event.latitude, event.longitude);
    showStatus(`Navigating to: ${event.title}`);
};

window.openCampusEventsDrawer = function() {
    window.openNoticeBoardModal();
};

let returnToNoticeBoardOnAddClose = false;

window.openAddEventModal = function(defaultBuildingId = "") {
    const modal = document.getElementById("addEventModal");
    if (!modal) return;

    // Fix: If campus notice board is open, hide it so it doesn't block the add event modal
    const nbModal = document.getElementById("campusNoticeBoardModal");
    if (nbModal && nbModal.style.display === "flex") {
        returnToNoticeBoardOnAddClose = true;
        nbModal.style.display = "none";
    }

    const select = document.getElementById("eventInputBuilding");
    if (select) {
        select.innerHTML = '<option value="">Select campus venue / building...</option>';
        const sorted = [...buildings].sort((a, b) => a.name.localeCompare(b.name));
        sorted.forEach(b => {
            const opt = document.createElement("option");
            opt.value = b.buildingId;
            opt.textContent = `${b.name} (${b.type})`;
            select.appendChild(opt);
        });
        if (defaultBuildingId) select.value = defaultBuildingId;
    }
    modal.style.display = "flex";
};

// ==========================================================================
// CAMPUS NOTICE BOARD CONTROLLER & SCROLLABLE FEED
// ==========================================================================
const noticeBoardModal = document.getElementById("campusNoticeBoardModal");
const noticeBoardCloseBtn = document.getElementById("noticeBoardModalClose");
const noticeBoardSearchInput = document.getElementById("noticeBoardSearchInput");
const noticeBoardScrollArea = document.getElementById("noticeBoardScrollArea");
const noticeBoardCategoryTabs = document.getElementById("noticeBoardCategoryTabs");
const noticeBoardCountText = document.getElementById("noticeBoardCountText");
const noticeBoardMapModeBtn = document.getElementById("noticeBoardMapModeBtn");

let currentNoticeBoardCategory = 'all';

function renderNoticeBoardItems(category = currentNoticeBoardCategory, query = '') {
    if (!noticeBoardScrollArea) return;
    const q = query.toLowerCase().trim();
    
    const categoryColors = {
        academic: { bg: '#e0e7ff', text: '#3730a3', icon: '📚' },
        tech: { bg: '#ecfdf5', text: '#065f46', icon: '💻' },
        sports: { bg: '#fef3c7', text: '#92400e', icon: '⚽' },
        guild: { bg: '#f3e8ff', text: '#6b21a8', icon: '🏛️' },
        cultural: { bg: '#fce7f3', text: '#9d174d', icon: '🎨' },
        ceremony: { bg: '#fee2e2', text: '#991b1b', icon: '🎓' },
        general: { bg: '#f1f5f9', text: '#334155', icon: '📢' }
    };

    const filtered = campusEventsList.filter(e => {
        const matchesCategory = (category === 'all') || (e.category && e.category.toLowerCase() === category.toLowerCase());
        const matchesQuery = !q || (
            (e.title && e.title.toLowerCase().includes(q)) ||
            (e.buildingName && e.buildingName.toLowerCase().includes(q)) ||
            (e.room && e.room.toLowerCase().includes(q)) ||
            (e.organizer && e.organizer.toLowerCase().includes(q)) ||
            (e.description && e.description.toLowerCase().includes(q))
        );
        return matchesCategory && matchesQuery;
    });

    if (noticeBoardCountText) {
        noticeBoardCountText.textContent = `Showing ${filtered.length} active ${filtered.length === 1 ? 'notice' : 'notices'}`;
    }

    if (filtered.length === 0) {
        noticeBoardScrollArea.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
                <strong style="color: #334155; font-size: 14px;">No notices found</strong>
                <p style="font-size: 12px; margin-top: 4px;">No upcoming notices match the current filter or search criteria.</p>
                <button type="button" class="post-notice-btn" style="margin: 14px auto 0;" onclick="window.openAddEventModal()">
                    ➕ Post First Notice Here
                </button>
            </div>
        `;
        return;
    }

    noticeBoardScrollArea.innerHTML = filtered.map(e => {
        const d = new Date(e.startDate);
        const month = isNaN(d.getTime()) ? 'OCT' : d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const day = isNaN(d.getTime()) ? '📅' : d.getDate();
        const catInfo = categoryColors[e.category] || categoryColors.general;

        return `
            <div class="notice-bulletin-card" data-event-id="${e.eventId}">
                <div class="notice-card-header">
                    <div class="notice-date-badge">
                        <span class="notice-date-month">${month}</span>
                        <span class="notice-date-day">${day}</span>
                    </div>
                    <div class="notice-header-details">
                        <div class="notice-card-pill-row">
                            <span class="notice-category-pill" style="background:${catInfo.bg}; color:${catInfo.text};">
                                ${catInfo.icon} ${e.categoryLabel || e.category || 'Event'}
                            </span>
                            <span class="notice-host-tag">By ${e.organizer || 'Kyambogo Guild'}</span>
                        </div>
                        <h3 class="notice-card-title">${e.title}</h3>
                    </div>
                </div>

                <div class="notice-location-row">
                    <span>📍</span>
                    <span><b>${e.buildingName || 'Campus Venue'}</b> &bull; ${e.room || 'Main Hall / Pavilion'}</span>
                </div>

                <div class="notice-time-row">
                    <span>🕒</span>
                    <span>${e.dateFormatted || e.startDate} &bull; ${e.time || '10:00 AM'}</span>
                </div>

                <p class="notice-desc-text">${e.description || 'Join students and staff for this university gathering.'}</p>

                <div class="notice-card-footer">
                    <div class="notice-actions-group">
                        <button type="button" class="notice-btn notice-btn-directions" onclick="event.stopPropagation(); window.closeNoticeBoardAndNavigate('${e.eventId}')">
                            🧭 Walk Here
                        </button>
                        <button type="button" class="notice-btn notice-btn-map" onclick="event.stopPropagation(); window.closeNoticeBoardAndShowMap('${e.eventId}')">
                            📍 View on Map
                        </button>
                        <button type="button" class="notice-btn notice-btn-agenda" onclick="event.stopPropagation(); window.openEventDetails('${e.eventId}')">
                            📖 Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.openNoticeBoardModal = function(initialCategory = 'all') {
    currentNoticeBoardCategory = initialCategory;
    if (noticeBoardCategoryTabs) {
        noticeBoardCategoryTabs.querySelectorAll('.notice-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-category') === currentNoticeBoardCategory);
        });
    }
    if (noticeBoardSearchInput) noticeBoardSearchInput.value = '';
    renderNoticeBoardItems(currentNoticeBoardCategory, '');
    if (noticeBoardModal) noticeBoardModal.style.display = "flex";
};

window.closeNoticeBoardModal = function() {
    if (noticeBoardModal) noticeBoardModal.style.display = "none";
};

window.closeNoticeBoardAndNavigate = function(eventId) {
    window.closeNoticeBoardModal();
    window.navigateToEvent(eventId);
};

window.closeNoticeBoardAndShowMap = function(eventId) {
    window.closeNoticeBoardModal();
    const ev = campusEventsList.find(x => x.eventId === eventId);
    if (ev && typeof ev.latitude === 'number' && typeof ev.longitude === 'number') {
        map.setView([ev.latitude, ev.longitude], 18, { animate: true });
        const markerObj = (window.buildings || buildings || []).find(b => b.buildingId === ev.buildingId);
        if (markerObj && markerObj.marker) {
            markerObj.marker.openPopup();
        }
    }
};

if (noticeBoardCloseBtn && noticeBoardModal) {
    noticeBoardCloseBtn.addEventListener("click", window.closeNoticeBoardModal);
    noticeBoardModal.addEventListener("click", (e) => {
        if (e.target === noticeBoardModal) window.closeNoticeBoardModal();
    });
}

if (noticeBoardSearchInput) {
    noticeBoardSearchInput.addEventListener("input", () => {
        renderNoticeBoardItems(currentNoticeBoardCategory, noticeBoardSearchInput.value);
    });
}

if (noticeBoardCategoryTabs) {
    noticeBoardCategoryTabs.querySelectorAll('.notice-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            noticeBoardCategoryTabs.querySelectorAll('.notice-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentNoticeBoardCategory = tab.getAttribute('data-category') || 'all';
            renderNoticeBoardItems(currentNoticeBoardCategory, noticeBoardSearchInput ? noticeBoardSearchInput.value : '');
        });
    });
}

if (noticeBoardMapModeBtn) {
    noticeBoardMapModeBtn.addEventListener("click", () => {
        window.closeNoticeBoardModal();
        applyCategoryFilter("events");
    });
}

// ==========================================================================
// LIVE CAMPUS EVENTS WALLPAPER & BOTTOM AMBIENT BULLETIN
// ==========================================================================

function calculateDaysRemaining(dateStr) {
    if (!dateStr) return null;
    const now = new Date();
    // Kampala UTC+3
    const today = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    today.setUTCHours(0, 0, 0, 0);

    const target = new Date(dateStr);
    target.setUTCHours(0, 0, 0, 0);

    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function getEventUrgencyBadge(startDate, endDate) {
    const daysStart = calculateDaysRemaining(startDate);
    const daysEnd = calculateDaysRemaining(endDate || startDate);

    if (daysStart <= 0 && daysEnd >= 0) {
        return `<span class="live-card-badge active-now"><span class="badge-dot pulse"></span>HAPPENING NOW</span>`;
    } else if (daysStart === 1) {
        return `<span class="live-card-badge tomorrow">⏳ Tomorrow</span>`;
    } else if (daysStart > 1 && daysStart <= 3) {
        return `<span class="live-card-badge soon">⏳ In ${daysStart} days</span>`;
    } else if (daysStart > 3) {
        return `<span class="live-card-badge upcoming">📅 Upcoming</span>`;
    } else {
        return `<span class="live-card-badge upcoming">Active</span>`;
    }
}

function renderLiveEventsWallpaper() {
    const liveBar = document.getElementById("liveEventsWallpaperBar");
    const track = document.getElementById("liveWallpaperTrack");
    const countChip = document.getElementById("liveWallpaperCountChip");
    const pillBadge = document.getElementById("livePillBadge");

    if (!liveBar || !track) return;

    // Filter strictly to active upcoming events (passed deadlines auto-pruned)
    const activeEvents = (Array.isArray(campusEventsList) ? campusEventsList : []).filter(isEventActive);

    if (countChip) countChip.textContent = `${activeEvents.length} Active`;
    if (pillBadge) pillBadge.textContent = `${activeEvents.length}`;

    if (activeEvents.length === 0) {
        track.innerHTML = `
            <div class="wallpaper-empty-card" style="padding: 2px 10px; font-size: 11px;">
                <span>🗓️ No upcoming public events currently scheduled. Check back soon!</span>
            </div>
        `;
        return;
    }

    track.innerHTML = "";

    // Television broadcast continuous ribbon: duplicate list so loop flows seamlessly
    const ribbonFeed = [...activeEvents, ...activeEvents];

    ribbonFeed.forEach((evt, idx) => {
        const item = document.createElement("div");
        item.className = "live-broadcast-ribbon-item";
        item.title = `Click to fly to ${evt.buildingName || 'venue'}: ${evt.title}`;

        const category = evt.categoryLabel || evt.category || 'EVENT';
        const venue = evt.buildingName || 'Campus Venue';
        const date = evt.dateFormatted || evt.startDate;
        const daysLeft = calculateDaysRemaining(evt.startDate);
        const isUrgent = daysLeft <= 1;

        item.innerHTML = `
            <span class="live-ribbon-tag ${isUrgent ? 'urgent' : ''}">${category}</span>
            <span class="live-ribbon-title">${evt.title}</span>
            <span class="live-ribbon-venue">📍 ${venue}</span>
            <span class="live-ribbon-date">🕒 ${date}</span>
            <span class="live-ribbon-nav-action">🧭 Fly to Venue</span>
            <span class="live-ribbon-separator">◆</span>
        `;

        item.addEventListener("click", () => {
            window.flyToEventVenue(evt.latitude, evt.longitude, evt.buildingId, evt.title);
        });

        track.appendChild(item);
    });

    startWallpaperAutoScroll();
}

function startWallpaperAutoScroll() {
    const scrollContainer = document.getElementById("liveWallpaperScrollContainer");
    if (!scrollContainer) return;

    if (liveWallpaperInterval) clearInterval(liveWallpaperInterval);

    liveWallpaperInterval = setInterval(() => {
        if (!scrollContainer || scrollContainer.matches(':hover')) return;

        const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
        if (maxScroll <= 0) return;

        // Continuous television broadcast news ticker crawl
        if (scrollContainer.scrollLeft >= maxScroll / 2) {
            scrollContainer.scrollLeft = 0; // Seamless seamless loop
        } else {
            scrollContainer.scrollLeft += 1;
        }
    }, 28);
}

// Global fly to event venue on the map
window.flyToEventVenue = function(lat, lng, buildingId, title) {
    if (window.closeFullscreenWallpaper) window.closeFullscreenWallpaper();

    map.flyTo([lat, lng], 18, {
        duration: 1.2,
        easeLinearity: 0.25
    });

    const bldg = buildings.find(b => b.buildingId === buildingId);
    if (bldg && bldg.marker) {
        setTimeout(() => {
            bldg.marker.openPopup();
        }, 1300);
    }

    showStatus(`📍 Live Event Venue: ${title || 'Kyambogo Campus'}`);
};

// Fullscreen Ambient Live Wallpaper Modal
function updateWallpaperLiveClock() {
    const timeEl = document.getElementById("wallpaperLiveTime");
    const dateEl = document.getElementById("wallpaperLiveDate");
    if (!timeEl && !dateEl) return;

    const now = new Date();
    // Kampala UTC+3
    const eatNow = new Date(now.getTime() + (3 * 60 * 60 * 1000));

    if (timeEl) {
        timeEl.textContent = eatNow.toISOString().substring(11, 19) + " EAT";
    }
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
        dateEl.textContent = eatNow.toLocaleDateString('en-GB', options) + " • Kyambogo University";
    }
}

window.openFullscreenWallpaper = function() {
    const modal = document.getElementById("fullscreenWallpaperModal");
    const grid = document.getElementById("wallpaperEventsGrid");
    if (!modal || !grid) return;

    updateWallpaperLiveClock();
    if (wallpaperClockInterval) clearInterval(wallpaperClockInterval);
    wallpaperClockInterval = setInterval(updateWallpaperLiveClock, 1000);

    const activeEvents = (Array.isArray(campusEventsList) ? campusEventsList : []).filter(isEventActive);

    grid.innerHTML = "";
    activeEvents.forEach(evt => {
        const item = document.createElement("div");
        item.className = "wallpaper-grid-card";
        const urgencyHtml = getEventUrgencyBadge(evt.startDate, evt.endDate);

        item.innerHTML = `
            <div class="wgc-header">
                <span class="wgc-badge">${evt.categoryLabel || evt.category}</span>
                ${urgencyHtml}
            </div>
            <h3 class="wgc-title">${evt.title}</h3>
            <div class="wgc-venue"><b>📍 Location:</b> ${evt.buildingName} (${evt.room || 'Campus'})</div>
            <div class="wgc-time"><b>📅 Date & Time:</b> ${evt.dateFormatted || evt.startDate} • ${evt.time}</div>
            <p class="wgc-desc">${evt.description}</p>
            <div class="wgc-actions">
                <button class="wgc-btn primary" onclick="window.flyToEventVenue(${evt.latitude}, ${evt.longitude}, '${evt.buildingId}', '${evt.title.replace(/'/g, "\\'")}')">
                    🧭 Locate on Campus Map
                </button>
                <button class="wgc-btn secondary" onclick="window.closeFullscreenWallpaper(); window.openEventDetails('${evt.eventId}')">
                    📖 Full Agenda
                </button>
            </div>
        `;
        grid.appendChild(item);
    });

    modal.style.display = "flex";
};

window.closeFullscreenWallpaper = function() {
    const modal = document.getElementById("fullscreenWallpaperModal");
    if (modal) modal.style.display = "none";
    if (wallpaperClockInterval) {
        clearInterval(wallpaperClockInterval);
        wallpaperClockInterval = null;
    }
};

// Toggle bottom live bar collapse
window.toggleLiveWallpaperBar = function() {
    const bar = document.getElementById("liveEventsWallpaperBar");
    const pill = document.getElementById("liveEventsPillBtn");
    const collapseIcon = document.getElementById("collapseIcon");

    isLiveWallpaperCollapsed = !isLiveWallpaperCollapsed;

    if (isLiveWallpaperCollapsed) {
        if (bar) bar.style.display = "none";
        if (pill) pill.style.display = "inline-flex";
    } else {
        if (bar) bar.style.display = "flex";
        if (pill) pill.style.display = "none";
        if (collapseIcon) collapseIcon.textContent = "▼";
    }
};

// Wire up Live Wallpaper Event Listeners
const fullscreenWallpaperBtn = document.getElementById("fullscreenWallpaperBtn");
if (fullscreenWallpaperBtn) {
    fullscreenWallpaperBtn.addEventListener("click", window.openFullscreenWallpaper);
}

const toggleWallpaperCollapseBtn = document.getElementById("toggleWallpaperCollapseBtn");
if (toggleWallpaperCollapseBtn) {
    toggleWallpaperCollapseBtn.addEventListener("click", window.toggleLiveWallpaperBar);
}

const liveEventsPillBtn = document.getElementById("liveEventsPillBtn");
if (liveEventsPillBtn) {
    liveEventsPillBtn.addEventListener("click", window.toggleLiveWallpaperBar);
}

const closeWallpaperModalBtn = document.getElementById("closeWallpaperModalBtn");
if (closeWallpaperModalBtn) {
    closeWallpaperModalBtn.addEventListener("click", window.closeFullscreenWallpaper);
}

const wallpaperBackToMapBtn = document.getElementById("wallpaperBackToMapBtn");
if (wallpaperBackToMapBtn) {
    wallpaperBackToMapBtn.addEventListener("click", window.closeFullscreenWallpaper);
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        window.closeFullscreenWallpaper();
    }
});

// Render immediately on load
renderLiveEventsWallpaper();

// Event Modal Close handlers
const eventModal = document.getElementById("eventModal");
const eventModalClose = document.getElementById("eventModalClose");
if (eventModalClose && eventModal) {
    eventModalClose.addEventListener("click", () => {
        eventModal.style.display = "none";
    });
    eventModal.addEventListener("click", (e) => {
        if (e.target === eventModal) eventModal.style.display = "none";
    });
}

// Add Event Modal Close handlers
const addEventModal = document.getElementById("addEventModal");
const addEventModalClose = document.getElementById("addEventModalClose");

function closeAddEventModal() {
    if (addEventModal) addEventModal.style.display = "none";
    if (returnToNoticeBoardOnAddClose) {
        returnToNoticeBoardOnAddClose = false;
        window.openNoticeBoardModal();
    }
}

if (addEventModalClose && addEventModal) {
    addEventModalClose.addEventListener("click", closeAddEventModal);
    addEventModal.addEventListener("click", (e) => {
        if (e.target === addEventModal) closeAddEventModal();
    });
}

// ==========================================================================
// GEMINI AI SMART NOTICE DRAfter
// ==========================================================================
const aiNoticePromptInput = document.getElementById("aiNoticePromptInput");
const aiEnhanceNoticeBtn = document.getElementById("aiEnhanceNoticeBtn");
const aiEnhanceBtnText = document.getElementById("aiEnhanceBtnText");
const aiEnhanceBtnSpinner = document.getElementById("aiEnhanceBtnSpinner");
const aiNoticeStatus = document.getElementById("aiNoticeStatus");

if (aiEnhanceNoticeBtn && aiNoticePromptInput) {
    aiEnhanceNoticeBtn.addEventListener("click", async () => {
        const prompt = aiNoticePromptInput.value.trim();
        if (!prompt) {
            if (aiNoticeStatus) {
                aiNoticeStatus.className = "ai-notice-status error";
                aiNoticeStatus.textContent = "Please enter rough event notes or text first.";
                aiNoticeStatus.style.display = "flex";
            }
            aiNoticePromptInput.focus();
            return;
        }

        try {
            aiEnhanceNoticeBtn.disabled = true;
            if (aiEnhanceBtnSpinner) aiEnhanceBtnSpinner.style.display = "inline";
            if (aiEnhanceBtnText) aiEnhanceBtnText.textContent = "Formatting...";
            if (aiNoticeStatus) {
                aiNoticeStatus.className = "ai-notice-status";
                aiNoticeStatus.style.display = "none";
            }

            const res = await fetch("/api/ai/enhance-notice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt })
            });

            const data = await res.json();
            if (data.success && data.enhanced) {
                const enh = data.enhanced;
                const titleEl = document.getElementById("eventInputTitle");
                const catEl = document.getElementById("eventInputCategory");
                const bldgEl = document.getElementById("eventInputBuilding");
                const dateEl = document.getElementById("eventInputDate");
                const timeEl = document.getElementById("eventInputTime");
                const orgEl = document.getElementById("eventInputOrganizer");
                const descEl = document.getElementById("eventInputDescription");

                if (titleEl && enh.title) titleEl.value = enh.title;
                if (catEl && enh.category) catEl.value = enh.category;
                if (bldgEl && enh.buildingId) {
                    bldgEl.value = enh.buildingId;
                    if (!bldgEl.value) {
                        // Attempt fallback match by name
                        const found = buildings.find(b => b.name.toLowerCase().includes(enh.buildingId.toLowerCase()));
                        if (found) bldgEl.value = found.buildingId;
                    }
                }
                if (dateEl && enh.date) dateEl.value = enh.date;
                if (timeEl && enh.time) timeEl.value = enh.time;
                if (orgEl && enh.organizer) orgEl.value = enh.organizer;
                if (descEl && enh.description) descEl.value = enh.description;

                if (aiNoticeStatus) {
                    aiNoticeStatus.className = "ai-notice-status success";
                    aiNoticeStatus.textContent = "✨ Notice fields auto-filled & formatted with Kyambogo AI!";
                    aiNoticeStatus.style.display = "flex";
                }
            } else {
                throw new Error(data.message || "Failed to auto-draft notice");
            }
        } catch (err) {
            if (aiNoticeStatus) {
                aiNoticeStatus.className = "ai-notice-status error";
                aiNoticeStatus.textContent = "AI note: " + err.message;
                aiNoticeStatus.style.display = "flex";
            }
        } finally {
            aiEnhanceNoticeBtn.disabled = false;
            if (aiEnhanceBtnSpinner) aiEnhanceBtnSpinner.style.display = "none";
            if (aiEnhanceBtnText) aiEnhanceBtnText.textContent = "⚡ Auto-Fill";
        }
    });
}

// Add Event submission & Admin Permission toggles
const addEventForm = document.getElementById("addEventForm");
const modeSubmitPending = document.getElementById("modeSubmitPending");
const modeAdminInstant = document.getElementById("modeAdminInstant");
const adminPasscodeInputGroup = document.getElementById("adminPasscodeInputGroup");
const eventSubmitActionBtn = document.getElementById("eventSubmitActionBtn");
const labelOptionPending = document.getElementById("labelOptionPending");
const labelOptionInstant = document.getElementById("labelOptionInstant");

function updateAdminAuthModeUI() {
    if (!modeAdminInstant || !adminPasscodeInputGroup) return;
    const isInstant = modeAdminInstant.checked;
    adminPasscodeInputGroup.style.display = isInstant ? "block" : "none";
    if (labelOptionInstant) labelOptionInstant.classList.toggle("active", isInstant);
    if (labelOptionPending) labelOptionPending.classList.toggle("active", !isInstant);
    if (eventSubmitActionBtn) {
        eventSubmitActionBtn.textContent = isInstant ? "📢 Authorize & Publish to Map" : "📨 Submit for Admin Approval";
    }
}

if (modeSubmitPending) modeSubmitPending.addEventListener("change", updateAdminAuthModeUI);
if (modeAdminInstant) modeAdminInstant.addEventListener("change", updateAdminAuthModeUI);

if (addEventForm) {
    addEventForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("eventInputTitle").value.trim();
        const category = document.getElementById("eventInputCategory").value;
        const buildingId = document.getElementById("eventInputBuilding").value;
        const startDate = document.getElementById("eventInputDate").value;
        const time = document.getElementById("eventInputTime").value.trim();
        const room = document.getElementById("eventInputRoom").value.trim();
        const organizer = document.getElementById("eventInputOrganizer").value.trim();
        const description = document.getElementById("eventInputDescription").value.trim();
        const isInstant = modeAdminInstant && modeAdminInstant.checked;
        const adminKey = isInstant ? document.getElementById("eventInputAdminKey")?.value.trim() : "";

        if (isInstant && !adminKey) {
            showStatus("⚠️ Please enter the Admin Passcode or select 'Submit Proposal for Admin Approval'.");
            return;
        }

        const bldg = buildings.find(b => b.buildingId === buildingId);

        const newEventPayload = {
            title,
            category,
            categoryLabel: category ? category.charAt(0).toUpperCase() + category.slice(1) : "Academic",
            buildingId,
            buildingName: bldg ? bldg.name : "Kyambogo Campus",
            startDate,
            endDate: startDate,
            dateFormatted: startDate,
            time: time || "All Day",
            room: room || "Main Venue",
            organizer: organizer || "Kyambogo Student Leadership",
            description: description || "No detailed outline provided.",
            attendees: "Kyambogo University Community",
            latitude: bldg ? bldg.lat : 0.3485,
            longitude: bldg ? bldg.lng : 32.6295,
            adminKey: isInstant ? adminKey : undefined
        };

        try {
            const resp = await fetch("/api/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newEventPayload)
            });

            const resJson = await resp.json();

            if (resp.status === 401) {
                showStatus("⚠️ " + (resJson.message || "Invalid Admin Passcode!"));
                return;
            }

            if (resJson.approved) {
                // Instant admin publish
                campusEventsList.unshift(resJson.event || newEventPayload);
                updateEventsCountBadges();
                addEventModal.style.display = "none";
                addEventForm.reset();
                updateAdminAuthModeUI();
                showStatus(`🎉 Admin permission verified! Event "${title}" published live to campus map!`);

                if (bldg) {
                    map.setView([bldg.lat, bldg.lng], 18);
                    if (bldg.marker) {
                        bldg.marker.openPopup();
                    }
                }
            } else {
                // Pending admin approval queue
                addEventModal.style.display = "none";
                addEventForm.reset();
                updateAdminAuthModeUI();
                showStatus(`📋 Proposal for "${title}" submitted to Kyambogo Administration for review!`);
            }
        } catch (err) {
            console.error("Error submitting event:", err);
            showStatus("📋 Event proposal queued for campus administration review.");
            addEventModal.style.display = "none";
            addEventForm.reset();
        }
    });
}

// =========================================================================
// ADMIN EVENT APPROVALS & OFFICIAL CALENDAR SYNC PORTAL
// =========================================================================
const adminApprovalsModal = document.getElementById("adminApprovalsModal");
const adminApprovalsModalClose = document.getElementById("adminApprovalsModalClose");
const adminModalLockBtn = document.getElementById("adminModalLockBtn");
const adminLockQueueBtn = document.getElementById("adminLockQueueBtn");
const adminAuthPrompt = document.getElementById("adminAuthPrompt");
const adminNavTabs = document.getElementById("adminNavTabs");
const adminTabEventsBtn = document.getElementById("adminTabEventsBtn");
const adminTabAnalyticsBtn = document.getElementById("adminTabAnalyticsBtn");
const adminPendingEventsContainer = document.getElementById("adminPendingEventsContainer");
const adminAnalyticsSection = document.getElementById("adminAnalyticsSection");
const adminPortalPassInput = document.getElementById("adminPortalPassInput");
const adminPortalUnlockBtn = document.getElementById("adminPortalUnlockBtn");
const adminPendingEventsList = document.getElementById("adminPendingEventsList");
const adminPendingStatusText = document.getElementById("adminPendingStatusText");
const adminRefreshPendingBtn = document.getElementById("adminRefreshPendingBtn");
const adminSyncCalendarBtn = document.getElementById("adminSyncCalendarBtn");
const adminSyncCalText = document.getElementById("adminSyncCalText");

// Analytics metric DOM elements
const metricUniqueVisitors = document.getElementById("metricUniqueVisitors");
const metricTodayActive = document.getElementById("metricTodayActive");
const metricTotalVisits = document.getElementById("metricTotalVisits");
const metricTotalChats = document.getElementById("metricTotalChats");
const adminChatsLogList = document.getElementById("adminChatsLogList");
const adminRefreshChatsBtn = document.getElementById("adminRefreshChatsBtn");
const adminExportChatsBtn = document.getElementById("adminExportChatsBtn");

let verifiedAdminKey = "";
let cachedChatsData = [];

// Lock Admin Portal immediately and wipe session credentials
function lockAdminPortal() {
    verifiedAdminKey = "";
    sessionStorage.removeItem("kyu_admin_session_key");
    if (adminPortalPassInput) adminPortalPassInput.value = "";
    if (adminAuthPrompt) adminAuthPrompt.style.display = "block";
    if (adminNavTabs) adminNavTabs.style.display = "none";
    if (adminPendingEventsContainer) adminPendingEventsContainer.style.display = "none";
    if (adminAnalyticsSection) adminAnalyticsSection.style.display = "none";
    if (adminPendingEventsList) adminPendingEventsList.innerHTML = "";
    if (adminApprovalsModal) adminApprovalsModal.style.display = "none";
    showStatus("🔒 Admin portal locked.");
}

function openAdminApprovalsPortal() {
    if (!adminApprovalsModal) return;
    // Always start in locked state requiring passcode entry
    verifiedAdminKey = "";
    sessionStorage.removeItem("kyu_admin_session_key");
    if (adminAuthPrompt) adminAuthPrompt.style.display = "block";
    if (adminPendingEventsContainer) adminPendingEventsContainer.style.display = "none";
    if (adminPendingEventsList) adminPendingEventsList.innerHTML = "";
    if (adminPortalPassInput) {
        adminPortalPassInput.value = "";
        setTimeout(() => adminPortalPassInput.focus(), 150);
    }
    adminApprovalsModal.style.display = "flex";
}

async function loadPendingAdminEvents(key) {
    if (!adminPendingEventsList) return;
    adminPendingEventsList.innerHTML = `<div style="text-align:center; padding:15px; color:#64748b;">🔄 Loading pending submissions...</div>`;

    try {
        const resp = await fetch("/api/admin/events/pending", {
            headers: { "x-admin-key": key }
        });
        if (!resp.ok) {
            verifiedAdminKey = "";
            sessionStorage.removeItem("kyu_admin_session_key");
            if (adminAuthPrompt) adminAuthPrompt.style.display = "block";
            if (adminPendingEventsContainer) adminPendingEventsContainer.style.display = "none";
            showStatus("⚠️ Incorrect admin passcode.");
            return;
        }

        const data = await resp.json();
        verifiedAdminKey = key;

        if (adminAuthPrompt) adminAuthPrompt.style.display = "none";
        if (adminNavTabs) adminNavTabs.style.display = "flex";
        if (adminPendingEventsContainer) adminPendingEventsContainer.style.display = "block";
        if (adminAnalyticsSection) adminAnalyticsSection.style.display = "none";
        if (adminTabEventsBtn) adminTabEventsBtn.classList.add("active");
        if (adminTabAnalyticsBtn) adminTabAnalyticsBtn.classList.remove("active");

        const pending = data.events || [];
        if (adminPendingStatusText) {
            adminPendingStatusText.textContent = `Pending Submissions: ${pending.length}`;
        }

        if (pending.length === 0) {
            adminPendingEventsList.innerHTML = `
                <div style="text-align:center; padding:30px 10px; color:#64748b;">
                    <div style="font-size:32px; margin-bottom:8px;">✅</div>
                    <strong>All Caught Up!</strong>
                    <p style="margin:4px 0 0; font-size:12px;">There are no pending campus event submissions awaiting admin review.</p>
                </div>
            `;
            return;
        }

        adminPendingEventsList.innerHTML = "";
        pending.forEach(evt => {
            const card = document.createElement("div");
            card.className = "admin-pending-item-card";
            card.id = `adminCard-${evt.eventId}`;
            card.innerHTML = `
                <span class="admin-pending-badge">⏳ Needs Admin Approval</span>
                <h4>${evt.title}</h4>
                <div class="admin-pending-meta">
                    <div>📍 <b>Venue:</b> ${evt.buildingName} ${evt.room ? `(${evt.room})` : ''}</div>
                    <div>📅 <b>Date & Time:</b> ${evt.startDate} • ${evt.time}</div>
                    <div>👤 <b>Organizer:</b> ${evt.organizer}</div>
                </div>
                ${evt.description ? `<div class="admin-pending-desc">${evt.description}</div>` : ''}
                <div class="admin-pending-actions">
                    <button class="admin-btn-approve" data-id="${evt.eventId}">✅ Approve & Publish</button>
                    <button class="admin-btn-reject" data-id="${evt.eventId}">❌ Reject</button>
                </div>
            `;

            card.querySelector(".admin-btn-approve").onclick = () => approvePendingEvent(evt.eventId, key);
            card.querySelector(".admin-btn-reject").onclick = () => rejectPendingEvent(evt.eventId, key);
            adminPendingEventsList.appendChild(card);
        });
    } catch (err) {
        adminPendingEventsList.innerHTML = `<div style="text-align:center; padding:15px; color:#ef4444;">Error loading proposals.</div>`;
    }
}

async function approvePendingEvent(id, key) {
    try {
        const resp = await fetch(`/api/admin/events/${encodeURIComponent(id)}/approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-key": key
            }
        });
        const resJson = await resp.json();
        if (resp.ok && resJson.event) {
            campusEventsList.unshift(resJson.event);
            updateEventsCountBadges();
            showStatus(`✅ Approved: "${resJson.event.title}" is now live on the map!`);
            loadPendingAdminEvents(key);
        } else {
            showStatus("⚠️ " + (resJson.message || "Failed to approve event"));
        }
    } catch (err) {
        showStatus("Error approving event.");
    }
}

async function rejectPendingEvent(id, key) {
    if (!confirm("Are you sure you want to reject this event proposal?")) return;
    try {
        const resp = await fetch(`/api/admin/events/${encodeURIComponent(id)}/reject`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-key": key
            }
        });
        const resJson = await resp.json();
        if (resp.ok) {
            showStatus(`Event proposal rejected.`);
            loadPendingAdminEvents(key);
        }
    } catch (err) {
        showStatus("Error rejecting event.");
    }
}

// Load User Traffic & AI Chat Insights
async function loadAdminAnalytics() {
    if (!adminChatsLogList) return;
    adminChatsLogList.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;">🔄 Loading user traffic and chats...</div>`;

    try {
        const [aResp, cResp] = await Promise.all([
            fetch("/api/admin/analytics"),
            fetch("/api/admin/chats")
        ]);
        const aData = await aResp.json();
        const cData = await cResp.json();

        if (aData.success) {
            if (metricUniqueVisitors) metricUniqueVisitors.textContent = aData.uniqueVisitors || 0;
            if (metricTodayActive) metricTodayActive.textContent = aData.todayActive || 0;
            if (metricTotalVisits) metricTotalVisits.textContent = aData.totalVisits || 0;
            if (metricTotalChats) metricTotalChats.textContent = aData.totalAiChats || 0;
        }

        const chats = (cData.chats && cData.chats.length > 0) ? cData.chats : (aData.recentChats || []);
        cachedChatsData = chats;

        if (chats.length === 0) {
            adminChatsLogList.innerHTML = `
                <div style="text-align:center; padding:30px 10px; color:#64748b;">
                    <div style="font-size:28px; margin-bottom:6px;">💬</div>
                    <strong>No User Chats Recorded Yet</strong>
                    <p style="font-size:12px; margin-top:2px;">When students ask questions to the AI guide, they will appear here in real-time.</p>
                </div>
            `;
            return;
        }

        adminChatsLogList.innerHTML = chats.map(c => {
            const timeStr = c.timestamp ? new Date(c.timestamp).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Recent';

            const recBadge = c.suggestedBuildingName ? `
                <span class="admin-chat-rec-pill">
                    📍 Recommended: ${c.suggestedBuildingName}
                </span>
            ` : '';

            return `
                <div class="admin-chat-card">
                    <div class="admin-chat-card-top">
                        <span>👤 Visitor: <code>${(c.visitorId || 'anon').substring(0, 12)}</code></span>
                        <span>🕒 ${timeStr}</span>
                    </div>
                    <div class="admin-chat-q">
                        <span>❓</span> <span><b>"${c.question}"</b></span>
                    </div>
                    <div class="admin-chat-a">
                        ${c.answer}
                    </div>
                    ${recBadge}
                </div>
            `;
        }).join('');

    } catch (err) {
        adminChatsLogList.innerHTML = `<div style="text-align:center; padding:15px; color:#dc2626;">Error loading analytics: ${err.message}</div>`;
    }
}

// Tab handlers in Admin Portal
if (adminTabEventsBtn && adminTabAnalyticsBtn) {
    adminTabEventsBtn.addEventListener("click", () => {
        adminTabEventsBtn.classList.add("active");
        adminTabAnalyticsBtn.classList.remove("active");
        if (adminPendingEventsContainer) adminPendingEventsContainer.style.display = "block";
        if (adminAnalyticsSection) adminAnalyticsSection.style.display = "none";
    });
    adminTabAnalyticsBtn.addEventListener("click", () => {
        adminTabAnalyticsBtn.classList.add("active");
        adminTabEventsBtn.classList.remove("active");
        if (adminPendingEventsContainer) adminPendingEventsContainer.style.display = "none";
        if (adminAnalyticsSection) adminAnalyticsSection.style.display = "block";
        loadAdminAnalytics();
    });
}

if (adminRefreshChatsBtn) {
    adminRefreshChatsBtn.addEventListener("click", loadAdminAnalytics);
}

if (adminExportChatsBtn) {
    adminExportChatsBtn.addEventListener("click", () => {
        if (!cachedChatsData || cachedChatsData.length === 0) {
            showStatus("No chat records to export yet.");
            return;
        }
        const blob = new Blob([JSON.stringify(cachedChatsData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kyambogo-campus-ai-chats-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus("📥 Downloaded chat history JSON for AI training & analysis!");
    });
}

// Passcode entry in admin unlock prompt
if (adminPortalUnlockBtn && adminPortalPassInput) {
    adminPortalUnlockBtn.addEventListener("click", () => {
        const pass = adminPortalPassInput.value.trim();
        if (pass) {
            loadPendingAdminEvents(pass);
        } else {
            showStatus("Please enter admin passcode.");
        }
    });
    adminPortalPassInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const pass = adminPortalPassInput.value.trim();
            if (pass) loadPendingAdminEvents(pass);
        }
    });
}

// Synchronize Kyambogo Official Academic Calendar with MongoDB & Map Dataset
if (adminSyncCalendarBtn) {
    adminSyncCalendarBtn.addEventListener("click", async () => {
        if (!verifiedAdminKey) {
            showStatus("⚠️ Admin passcode required to sync calendar.");
            return;
        }

        adminSyncCalendarBtn.disabled = true;
        if (adminSyncCalText) adminSyncCalText.textContent = "⏳ Syncing with University Calendar & MongoDB...";

        try {
            const resp = await fetch("/api/admin/events/sync-calendar", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-key": verifiedAdminKey
                }
            });
            const resJson = await resp.json();

            if (resp.ok && resJson.success) {
                if (resJson.events && Array.isArray(resJson.events)) {
                    const newIds = new Set(resJson.events.map(e => e.eventId));
                    campusEventsList = [...resJson.events, ...campusEventsList.filter(e => !newIds.has(e.eventId))];
                    updateEventsCountBadges();
                }
                showStatus(`🎉 ${resJson.message}`);
                if (adminSyncCalText) adminSyncCalText.textContent = `✅ Synced ${resJson.totalSynced} Events into MongoDB & Map!`;
                setTimeout(() => {
                    if (adminSyncCalText) adminSyncCalText.textContent = "Sync University Calendar Now";
                    adminSyncCalendarBtn.disabled = false;
                }, 3500);
            } else {
                showStatus("⚠️ " + (resJson.message || "Failed to sync calendar"));
                if (adminSyncCalText) adminSyncCalText.textContent = "Sync University Calendar Now";
                adminSyncCalendarBtn.disabled = false;
            }
        } catch (err) {
            console.error("Calendar sync UI error:", err);
            showStatus("Error synchronizing university calendar.");
            if (adminSyncCalText) adminSyncCalText.textContent = "Sync University Calendar Now";
            adminSyncCalendarBtn.disabled = false;
        }
    });
}

if (adminRefreshPendingBtn) {
    adminRefreshPendingBtn.addEventListener("click", () => {
        if (verifiedAdminKey) loadPendingAdminEvents(verifiedAdminKey);
    });
}

// STRICT LOCKING: Auto-lock portal on close, ESC key, or backdrop click
if (adminModalLockBtn) adminModalLockBtn.addEventListener("click", lockAdminPortal);
if (adminLockQueueBtn) adminLockQueueBtn.addEventListener("click", lockAdminPortal);
if (adminApprovalsModalClose) adminApprovalsModalClose.addEventListener("click", lockAdminPortal);

if (adminApprovalsModal) {
    adminApprovalsModal.addEventListener("click", (e) => {
        if (e.target === adminApprovalsModal) {
            lockAdminPortal();
        }
    });
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && adminApprovalsModal && adminApprovalsModal.style.display === "flex") {
        lockAdminPortal();
    }
});

// Sidepanel button to open Admin Approvals
setTimeout(() => {
    const panelAdminApprovalsButton = document.getElementById("panelAdminApprovalsButton");
    if (panelAdminApprovalsButton) {
        panelAdminApprovalsButton.addEventListener("click", () => {
            sidePanel.style.left = "-320px";
            openAdminApprovalsPortal();
        });
    }
}, 500);

document.getElementById("navigationButton").addEventListener("click", function () {
    sidePanel.style.left = "-320px";
    clearNavigation();
});

// View shared link
const sharedLocationInput = document.getElementById("sharedLocationInput");
const viewSharedLocation = document.getElementById("viewSharedLocation");
viewSharedLocation.addEventListener("click", function () {
    const sharedLink = sharedLocationInput.value.trim();
    if (sharedLink === "") {
        showStatus("Please paste a shared location link.");
        return;
    }
    try {
        const url = new URL(sharedLink);
        const sharedLat = parseFloat(url.searchParams.get("lat"));
        const sharedLng = parseFloat(url.searchParams.get("lng"));
        if (isNaN(sharedLat) || isNaN(sharedLng)) throw new Error("Invalid lat/lng");

        L.marker([sharedLat, sharedLng], { icon: redIcon })
            .addTo(map)
            .bindPopup("<b>📍 Shared Campus Location</b><br><button class='navigate-button' onclick='window.selectDestination(\"Shared Location\", " + sharedLat + ", " + sharedLng + ")'>Navigate Here</button>")
            .openPopup();
        map.setView([sharedLat, sharedLng], 18);
        sidePanel.style.left = "-320px";
        showStatus("Shared location loaded!");
    } catch (e) {
        showStatus("Invalid location link. Please check format.");
    }
});

// 11. CAMPUS NAVIGATION DOCK (Professional Left Vertical Toolbar)
const sideIcons = document.createElement("div");
sideIcons.id = "sideIcons";
sideIcons.className = "campus-map-dock";
sideIcons.setAttribute("role", "toolbar");
sideIcons.setAttribute("aria-label", "Campus Navigation Toolbar");
sideIcons.innerHTML = `
    <div class="campus-dock-header">
        <span class="campus-dock-brand" title="Kyambogo Digital Navigation">KYU</span>
        <button type="button" class="dock-collapse-toggle" id="dockCollapseToggle" title="Collapse / Expand Toolbar" aria-label="Toggle toolbar">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
        </button>
    </div>

    <div class="campus-dock-items" id="campusDockItems">
        <!-- 1. GPS Location -->
        <button type="button" class="dock-action-btn" id="summaryLocation" title="My Location" aria-label="My Location">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
            </svg>
            <div class="dock-tooltip">
                <strong>My Location</strong>
                <span>Locate GPS position on campus</span>
            </div>
        </button>

        <!-- 2. Walking Navigation (Shortest Footpath) -->
        <button type="button" class="dock-action-btn" id="summaryNavigation" title="Shortest Route" aria-label="Walking Navigation">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
            <div class="dock-tooltip">
                <strong>Shortest Footpath</strong>
                <span>Optimal campus walkway routing</span>
            </div>
        </button>

        <!-- 3. Buildings Directory -->
        <button type="button" class="dock-action-btn" id="summaryBuildings" title="Campus Buildings" aria-label="Campus Buildings">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                <line x1="9" y1="22" x2="9" y2="22.01"></line>
                <line x1="15" y1="22" x2="15" y2="22.01"></line>
                <line x1="8" y1="6" x2="8.01" y2="6"></line>
                <line x1="16" y1="6" x2="16.01" y2="6"></line>
                <line x1="12" y1="6" x2="12.01" y2="6"></line>
                <line x1="8" y1="10" x2="8.01" y2="10"></line>
                <line x1="12" y1="10" x2="12.01" y2="10"></line>
                <line x1="16" y1="10" x2="16.01" y2="10"></line>
                <line x1="8" y1="14" x2="8.01" y2="14"></line>
                <line x1="12" y1="14" x2="12.01" y2="14"></line>
                <line x1="16" y1="14" x2="16.01" y2="14"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
            </svg>
            <div class="dock-tooltip">
                <strong>Campus Buildings</strong>
                <span>60+ verified university landmarks</span>
            </div>
        </button>

        <!-- 4. Staff & HOD Offices -->
        <button type="button" class="dock-action-btn" id="summaryOffices" title="Staff Offices" aria-label="Staff Offices & HODs">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 21h18"></path>
                <path d="M5 21V7l7-4 7 4v14"></path>
                <path d="M9 21v-8h6v8"></path>
                <path d="M9 10h.01"></path>
                <path d="M15 10h.01"></path>
            </svg>
            <div class="dock-tooltip">
                <strong>Staff & HOD Offices</strong>
                <span>Faculty deans, heads & room numbers</span>
            </div>
        </button>

        <!-- 5. Campus Notice Board & Events -->
        <button type="button" class="dock-action-btn" id="summaryEvents" title="Campus Events" aria-label="Notice Board & Events">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <line x1="8" y1="14" x2="16" y2="14"></line>
                <line x1="8" y1="18" x2="13" y2="18"></line>
            </svg>
            <div class="dock-tooltip">
                <strong>Notice Board & Events</strong>
                <span>Announcements, sports & ceremonies</span>
            </div>
        </button>

        <div class="dock-divider"></div>

        <!-- 6. Toggle Map / Satellite Layer -->
        <button type="button" class="dock-action-btn" id="summaryLayers" title="Satellite View" aria-label="Toggle Satellite Layer">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            <div class="dock-tooltip">
                <strong>Satellite / Map</strong>
                <span>Toggle satellite photography view</span>
            </div>
        </button>

        <!-- 7. Install Mobile App & Play Store -->
        <button type="button" class="dock-action-btn" id="summaryInstall" title="Install App" aria-label="Install Mobile App">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
                <path d="M12 7v6m-3-3l3 3 3-3"></path>
            </svg>
            <div class="dock-tooltip">
                <strong>Install Mobile App</strong>
                <span>Android (.aab), iOS & PWA</span>
            </div>
        </button>

        <!-- 8. Share Location Link -->
        <button type="button" class="dock-action-btn" id="summaryShare" title="Share Map" aria-label="Share Location">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <div class="dock-tooltip">
                <strong>Share Location</strong>
                <span>Copy direct campus map link</span>
            </div>
        </button>

        <div class="dock-divider"></div>

        <!-- 9. About Creator (Derick Mabirizi) -->
        <button type="button" class="dock-action-btn dock-creator-btn" id="summaryAbout" title="Creator Profile" aria-label="About Creator Derick Mabirizi">
            <span class="dock-creator-monogram">DM</span>
            <div class="dock-tooltip">
                <strong>Derick Mabirizi</strong>
                <span>Lead Engineer • Creator Profile</span>
            </div>
        </button>
    </div>
`;

document.body.appendChild(sideIcons);

// Collapse / Expand Toolbar Toggle Handler
const dockCollapseToggle = document.getElementById("dockCollapseToggle");
if (dockCollapseToggle) {
    dockCollapseToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        sideIcons.classList.toggle("collapsed");
    });
}

// Satellite Layer Quick Toggle from Dock
const summaryLayersBtn = document.getElementById("summaryLayers");
if (summaryLayersBtn) {
    summaryLayersBtn.addEventListener("click", () => {
        if (map.hasLayer(satelliteTileLayer)) {
            if (layerStreetBtn) layerStreetBtn.click();
            summaryLayersBtn.classList.remove("active");
        } else {
            if (layerSatBtn) layerSatBtn.click();
            summaryLayersBtn.classList.add("active");
        }
    });
}

// Events Quick Button from Dock
const summaryEventsBtn = document.getElementById("summaryEvents");
if (summaryEventsBtn) {
    summaryEventsBtn.addEventListener("click", () => {
        const modal = document.getElementById("campusNoticeBoardModal");
        if (modal) {
            modal.style.display = "flex";
            if (typeof renderNoticeBoardFeed === "function") renderNoticeBoardFeed();
        } else if (typeof applyCategoryFilter === "function") {
            applyCategoryFilter("events");
        }
    });
}

document.getElementById("summaryLocation").addEventListener("click", () => locationButton.click());
document.getElementById("summaryBuildings").addEventListener("click", () => {
    sidePanel.style.left = "0px";
    document.getElementById("buildingsName").click();
});
document.getElementById("summaryOffices").addEventListener("click", () => {
    sidePanel.style.left = "0px";
    document.getElementById("officesPanelButton").click();
});
document.getElementById("summaryNavigation").addEventListener("click", () => {
    if (destination) {
        getRoute();
    } else {
        showStatus("Search for a programme, department, or office to navigate.");
        searchBox.focus();
    }
});
document.getElementById("summaryShare").addEventListener("click", () => shareLocationBtn.click());

const summaryInstallBtn = document.getElementById("summaryInstall");
if (summaryInstallBtn) {
    summaryInstallBtn.addEventListener("click", () => {
        const pwaModalEl = document.getElementById("pwaModal");
        if (pwaModalEl) pwaModalEl.style.display = "flex";
    });
}

const sidepanelInstallAppBtn = document.getElementById("sidepanelInstallAppBtn");
if (sidepanelInstallAppBtn) {
    sidepanelInstallAppBtn.addEventListener("click", () => {
        const pwaModalEl = document.getElementById("pwaModal");
        if (pwaModalEl) pwaModalEl.style.display = "flex";
    });
}

// =========================================================================
// PROGRESSIVE WEB APP (PWA), SERVICE WORKER & GOOGLE PLAY STORE INTEGRATION
// =========================================================================

// 1. Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Kyambogo Campus Map SW registered successfully:', registration.scope);
            })
            .catch((error) => {
                console.warn('Kyambogo Campus Map SW registration notice:', error);
            });
    });
}

// 2. Connectivity / Offline status monitor
const offlineToast = document.getElementById('offlineToast');
function updateOnlineStatus() {
    if (!navigator.onLine) {
        if (offlineToast) offlineToast.style.display = 'flex';
        showStatus('Offline mode active. Campus map is loaded from offline cache.');
    } else {
        if (offlineToast) offlineToast.style.display = 'none';
    }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// 3. BeforeInstallPrompt (Android & Chrome Web Install)
let deferredInstallPrompt = null;
const installAppBtn = document.getElementById('installAppBtn');
const pwaModal = document.getElementById('pwaModal');
const pwaModalClose = document.getElementById('pwaModalClose');
const pwaDirectInstallBtn = document.getElementById('pwaDirectInstallBtn');
const androidInstallHint = document.getElementById('androidInstallHint');
const tabBtnInstall = document.getElementById('tabBtnInstall');
const tabBtnPlaystore = document.getElementById('tabBtnPlaystore');
const tabInstall = document.getElementById('tabInstall');
const tabPlaystore = document.getElementById('tabPlaystore');
const pwaCopyGuideBtn = document.getElementById('pwaCopyGuideBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (androidInstallHint) {
        androidInstallHint.innerText = 'Click below to immediately install the Kyambogo app on your home screen.';
    }
});

const bottomInstallAppBtn = document.getElementById('bottomInstallAppBtn');

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    showStatus('Kyambogo Digital Campus Map installed successfully!');
    if (pwaModal) pwaModal.style.display = 'none';
    if (installAppBtn) installAppBtn.innerText = '📲 App Installed';
    if (bottomInstallAppBtn) {
        const textSpan = bottomInstallAppBtn.querySelector('.btn-text');
        if (textSpan) textSpan.innerText = 'App Installed';
    }
});

// Modal toggle
function openAppModal() {
    if (pwaModal) pwaModal.style.display = 'flex';
}

if (installAppBtn) {
    installAppBtn.addEventListener('click', openAppModal);
}

if (bottomInstallAppBtn) {
    bottomInstallAppBtn.addEventListener('click', openAppModal);
}

if (pwaModalClose && pwaModal) {
    pwaModalClose.addEventListener('click', () => {
        pwaModal.style.display = 'none';
    });
    pwaModal.addEventListener('click', (e) => {
        if (e.target === pwaModal) {
            pwaModal.style.display = 'none';
        }
    });
}

// Tabs
if (tabBtnInstall && tabBtnPlaystore && tabInstall && tabPlaystore) {
    tabBtnInstall.addEventListener('click', () => {
        tabBtnInstall.classList.add('active');
        tabBtnPlaystore.classList.remove('active');
        tabInstall.classList.add('active');
        tabPlaystore.classList.remove('active');
    });

    tabBtnPlaystore.addEventListener('click', () => {
        tabBtnPlaystore.classList.add('active');
        tabBtnInstall.classList.remove('active');
        tabPlaystore.classList.add('active');
        tabInstall.classList.remove('active');
    });
}

// Direct Install Trigger
if (pwaDirectInstallBtn) {
    pwaDirectInstallBtn.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                showStatus('Installing Kyambogo Campus Map...');
            }
            deferredInstallPrompt = null;
        } else {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                showStatus('On iPhone/iPad: Tap the Safari Share button and select "Add to Home Screen"');
            } else {
                showStatus('To install: Tap your browser menu (⋮) and select "Install app" or "Add to Home screen"');
            }
        }
    });
}

// Live PWA URL copy button & dynamic origin
const livePwaUrlText = document.getElementById('livePwaUrlText');
const copyLivePwaUrlBtn = document.getElementById('copyLivePwaUrlBtn');

if (livePwaUrlText) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
        livePwaUrlText.textContent = window.location.origin;
    }
}

if (copyLivePwaUrlBtn) {
    copyLivePwaUrlBtn.addEventListener('click', () => {
        const urlToCopy = livePwaUrlText ? livePwaUrlText.textContent : window.location.origin;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(urlToCopy).then(() => {
                copyLivePwaUrlBtn.textContent = '✓ Copied!';
                showStatus('Live PWA URL copied to clipboard!');
                setTimeout(() => {
                    copyLivePwaUrlBtn.textContent = '📋 Copy URL';
                }, 2500);
            });
        }
    });
}

// Copy guide button
if (pwaCopyGuideBtn) {
    pwaCopyGuideBtn.addEventListener('click', () => {
        const activeUrl = livePwaUrlText ? livePwaUrlText.textContent : window.location.origin;
        const guideText = `Kyambogo Digital Campus Map - Google Play Store Upload
1. Package ID: org.kyambogo.campusmap
2. 1-Click tool: Open https://www.pwabuilder.com and enter your app URL: ${activeUrl}
3. Click "Package for Stores" -> "Android" -> "Generate Package" to download your signed .aab bundle!
4. Upload the .aab to Google Play Console (https://play.google.com/console) under Production Releases.`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(guideText).then(() => {
                showStatus('Google Play upload guide copied to clipboard!');
            });
        }
    });
}

// =========================================================================
// ABOUT THE CREATOR MODAL CONTROLLER
// =========================================================================
const creatorModal = document.getElementById("creatorModal");
const aboutCreatorBtn = document.getElementById("aboutCreatorBtn");
const creatorModalClose = document.getElementById("creatorModalClose");
const copyCreatorEmailBtn = document.getElementById("copyCreatorEmailBtn");
const copyEmailText = document.getElementById("copyEmailText");
const creatorShareBtn = document.getElementById("creatorShareBtn");

function openCreatorModal() {
    if (creatorModal) {
        creatorModal.style.display = "flex";
    }
}

function closeCreatorModal() {
    if (creatorModal) {
        creatorModal.style.display = "none";
    }
}

if (aboutCreatorBtn) {
    aboutCreatorBtn.addEventListener("click", openCreatorModal);
}

if (creatorModalClose) {
    creatorModalClose.addEventListener("click", closeCreatorModal);
}

if (creatorModal) {
    creatorModal.addEventListener("click", (e) => {
        if (e.target === creatorModal) {
            closeCreatorModal();
        }
    });
}

const summaryAboutBtn = document.getElementById("summaryAbout");
if (summaryAboutBtn) {
    summaryAboutBtn.addEventListener("click", () => {
        openSidepanelWithAbout();
    });
}

if (copyCreatorEmailBtn) {
    copyCreatorEmailBtn.addEventListener("click", () => {
        const email = "mabiriziderick26@gmail.com";
        if (navigator.clipboard) {
            navigator.clipboard.writeText(email).then(() => {
                if (copyEmailText) copyEmailText.innerText = "Copied!";
                showStatus("Derick's email copied to clipboard!");
                setTimeout(() => {
                    if (copyEmailText) copyEmailText.innerText = "Copy Email";
                }, 2500);
            });
        }
    });
}

if (creatorShareBtn) {
    creatorShareBtn.addEventListener("click", () => {
        const shareData = {
            title: "Kyambogo Digital Campus Map",
            text: "Explore Kyambogo University campus map created by Derick Mabirizi:",
            url: window.location.href
        };
        if (navigator.share) {
            navigator.share(shareData).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(window.location.href).then(() => {
                showStatus("Campus map link copied to clipboard!");
            });
        }
    });
}

// =========================================================================
// MOBILE AUTO-ROTATE TO HORIZONTAL / LANDSCAPE VIEW
// =========================================================================
const landscapeRotateBanner = document.getElementById("landscapeRotateBanner");
const forceLandscapeBtn = document.getElementById("forceLandscapeBtn");
const dismissRotateBtn = document.getElementById("dismissRotateBtn");

let bannerDismissed = false;

function isPhoneOrMobile() {
    const ua = navigator.userAgent || "";
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 900 || window.innerHeight <= 900;
    return (mobileRegex.test(ua) || (isTouch && isSmallScreen));
}

function isCurrentlyPortrait() {
    if (screen.orientation && screen.orientation.type) {
        return screen.orientation.type.startsWith("portrait");
    }
    if (typeof window.orientation !== "undefined") {
        return window.orientation === 0 || window.orientation === 180;
    }
    return window.innerHeight > window.innerWidth;
}

async function requestLandscapeOrientation() {
    try {
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock("landscape");
            return true;
        } else if (screen.lockOrientation) {
            return screen.lockOrientation("landscape");
        } else if (screen.mozLockOrientation) {
            return screen.mozLockOrientation("landscape");
        } else if (screen.msLockOrientation) {
            return screen.msLockOrientation("landscape");
        }
    } catch (err) {
        // Standard mobile browsers may require fullscreen or user gesture
        return false;
    }
    return false;
}

async function forceFullscreenAndLandscape() {
    try {
        const docEl = document.documentElement;
        const requestFs = docEl.requestFullscreen ||
            docEl["webkitRequestFullscreen"] ||
            docEl["mozRequestFullScreen"] ||
            docEl["msRequestFullscreen"];
        const fsElement = document.fullscreenElement || document["webkitFullscreenElement"];
        if (requestFs && !fsElement) {
            await requestFs.call(docEl);
        }
    } catch (e) {
        // Fullscreen request may fail if blocked
    }
    await requestLandscapeOrientation();
    checkOrientationAndUpdateUI();
}

function checkOrientationAndUpdateUI() {
    if (!landscapeRotateBanner) return;
    
    if (!isPhoneOrMobile()) {
        landscapeRotateBanner.style.display = "none";
        return;
    }

    if (!isCurrentlyPortrait()) {
        // Device is in landscape! Hide banner
        landscapeRotateBanner.style.display = "none";
    } else {
        // Device is in portrait on phone
        if (!bannerDismissed) {
            landscapeRotateBanner.style.display = "block";
        }
    }
}

// 1. Immediately attempt orientation lock on load
requestLandscapeOrientation().then((success) => {
    if (!success) {
        checkOrientationAndUpdateUI();
    }
});

// 2. Also attempt on first user touch/tap anywhere
const firstTouchHandler = async () => {
    await requestLandscapeOrientation();
    checkOrientationAndUpdateUI();
    window.removeEventListener("touchstart", firstTouchHandler);
    window.removeEventListener("click", firstTouchHandler);
};
window.addEventListener("touchstart", firstTouchHandler, { passive: true });
window.addEventListener("click", firstTouchHandler, { passive: true });

// 3. Listen to orientation changes & resize
if (screen.orientation) {
    screen.orientation.addEventListener("change", () => {
        checkOrientationAndUpdateUI();
        if (typeof map !== "undefined" && map.invalidateSize) {
            setTimeout(() => map.invalidateSize(), 300);
        }
    });
}
window.addEventListener("orientationchange", () => {
    checkOrientationAndUpdateUI();
    if (typeof map !== "undefined" && map.invalidateSize) {
        setTimeout(() => map.invalidateSize(), 300);
    }
});
window.addEventListener("resize", () => {
    checkOrientationAndUpdateUI();
});

// 4. Force Landscape Button Click
if (forceLandscapeBtn) {
    forceLandscapeBtn.addEventListener("click", () => {
        forceFullscreenAndLandscape();
    });
}

// 5. Dismiss button
if (dismissRotateBtn) {
    dismissRotateBtn.addEventListener("click", () => {
        bannerDismissed = true;
        if (landscapeRotateBanner) {
            landscapeRotateBanner.style.display = "none";
        }
    });
}

// =========================================================================
// APP QR CODE GENERATOR & MODAL CONTROLLER
// =========================================================================
function getAppTargetUrl() {
    // 1. Check if user configured a custom production / uploaded URL
    const savedCustomUrl = safeStorage.getItem("kyu_app_qr_url");
    if (savedCustomUrl && savedCustomUrl.trim()) {
        return savedCustomUrl.trim();
    }

    // 2. Otherwise get clean origin without search parameters or hashes
    try {
        const urlObj = new URL(window.location.href);
        return urlObj.origin + (urlObj.pathname === "/" ? "" : urlObj.pathname);
    } catch (e) {
        return window.location.origin;
    }
}

async function renderAppQrCode() {
    const canvas = document.getElementById("appQrCanvas");
    const displayEl = document.getElementById("appQrUrlDisplay");
    const devWarning = document.getElementById("appQrDevWarning");
    const customUrlInput = document.getElementById("appQrCustomUrlInput");
    if (!canvas) return;

    const targetUrl = getAppTargetUrl();
    if (displayEl) {
        displayEl.textContent = targetUrl;
    }
    if (customUrlInput) {
        customUrlInput.value = targetUrl;
    }

    // Show warning if on dev preview host and no custom uploaded URL has been set
    if (devWarning) {
        const isDevHost = window.location.hostname.includes("ais-dev") || window.location.hostname === "localhost";
        const hasCustom = !!safeStorage.getItem("kyu_app_qr_url");
        devWarning.style.display = (isDevHost && !hasCustom) ? "block" : "none";
    }

    try {
        await QRCode.toCanvas(canvas, targetUrl, {
            width: 220,
            margin: 1.5,
            color: {
                dark: "#0bce3b", // Kyambogo green
                light: "#ffffff"
            },
            errorCorrectionLevel: "H"
        });
    } catch (err) {
        console.error("Failed to render QR Code:", err);
    }
}

const appQrBtn = document.getElementById("appQrBtn");
const bottomLeftQrBtn = document.getElementById("bottomLeftQrBtn");
const appQrModal = document.getElementById("appQrModal");
const appQrModalClose = document.getElementById("appQrModalClose");
const appQrCopyBtn = document.getElementById("appQrCopyBtn");
const appQrDownloadBtn = document.getElementById("appQrDownloadBtn");
const appQrShareBtn = document.getElementById("appQrShareBtn");
const editUrlToggle = document.getElementById("appQrEditUrlToggle");
const editUrlContainer = document.getElementById("appQrEditUrlContainer");
const applyUrlBtn = document.getElementById("appQrApplyUrlBtn");
const customUrlInput = document.getElementById("appQrCustomUrlInput");

if (editUrlToggle && editUrlContainer) {
    editUrlToggle.addEventListener("click", () => {
        const isHidden = editUrlContainer.style.display === "none";
        editUrlContainer.style.display = isHidden ? "flex" : "none";
        if (isHidden && customUrlInput) {
            customUrlInput.focus();
        }
    });
}

if (applyUrlBtn && customUrlInput) {
    applyUrlBtn.addEventListener("click", () => {
        const val = customUrlInput.value.trim();
        if (val) {
            safeStorage.setItem("kyu_app_qr_url", val);
            renderAppQrCode();
            showStatus("QR Code updated for: " + val);
            if (editUrlContainer) editUrlContainer.style.display = "none";
        }
    });
    customUrlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const val = customUrlInput.value.trim();
            if (val) {
                safeStorage.setItem("kyu_app_qr_url", val);
                renderAppQrCode();
                showStatus("QR Code updated for: " + val);
                if (editUrlContainer) editUrlContainer.style.display = "none";
            }
        }
    });
}

if (appQrBtn && appQrModal) {
    appQrBtn.addEventListener("click", () => {
        renderAppQrCode();
        appQrModal.style.display = "flex";
    });
}

if (bottomLeftQrBtn && appQrModal) {
    bottomLeftQrBtn.addEventListener("click", () => {
        renderAppQrCode();
        appQrModal.style.display = "flex";
    });
}

// Events Button Hover Tooltip
// Shows: "Activities, ceremonies, sports & occasions taking place in Kyambogo campus"
const eventsChips = document.querySelectorAll(".events-chip, [data-category='events']");
let eventsFloatingTooltipEl = null;

eventsChips.forEach(chip => {
    chip.addEventListener("mouseenter", () => {
        if (!eventsFloatingTooltipEl) {
            eventsFloatingTooltipEl = document.createElement("div");
            eventsFloatingTooltipEl.className = "events-hover-floating-tooltip";
            eventsFloatingTooltipEl.innerHTML = `<span>🎉</span> <span><b>Campus Events:</b> Activities, ceremonies, sports & occasions taking place in Kyambogo</span>`;
            document.body.appendChild(eventsFloatingTooltipEl);
        }
        const rect = chip.getBoundingClientRect();
        eventsFloatingTooltipEl.style.top = `${rect.bottom + 8}px`;
        eventsFloatingTooltipEl.style.left = `${Math.max(10, rect.left + (rect.width / 2) - 150)}px`;
        eventsFloatingTooltipEl.style.display = "flex";
    });

    chip.addEventListener("mouseleave", () => {
        if (eventsFloatingTooltipEl) {
            eventsFloatingTooltipEl.style.display = "none";
        }
    });

    chip.addEventListener("click", () => {
        if (eventsFloatingTooltipEl) {
            eventsFloatingTooltipEl.style.display = "none";
        }
    });
});

if (appQrModalClose && appQrModal) {
    appQrModalClose.addEventListener("click", () => {
        appQrModal.style.display = "none";
    });
    appQrModal.addEventListener("click", (e) => {
        if (e.target === appQrModal) {
            appQrModal.style.display = "none";
        }
    });
}

if (appQrCopyBtn) {
    appQrCopyBtn.addEventListener("click", () => {
        const appUrl = getAppTargetUrl();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(appUrl).then(() => {
                appQrCopyBtn.textContent = "Copied!";
                showStatus("App link copied to clipboard!");
                setTimeout(() => {
                    appQrCopyBtn.textContent = "📋 Copy";
                }, 2500);
            });
        }
    });
}

if (appQrDownloadBtn) {
    appQrDownloadBtn.addEventListener("click", () => {
        const canvas = document.getElementById("appQrCanvas");
        if (!canvas) return;
        const link = document.createElement("a");
        link.download = "kyambogo-campus-map-qr.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        showStatus("App QR Code downloaded!");
    });
}

if (appQrShareBtn) {
    appQrShareBtn.addEventListener("click", () => {
        const appUrl = getAppTargetUrl();
        if (navigator.share) {
            navigator.share({
                title: "Kyambogo Digital Campus Map",
                text: "Open and navigate Kyambogo University campus directly on your mobile device:",
                url: appUrl
            }).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(appUrl).then(() => {
                showStatus("App link copied to clipboard!");
            });
        }
    });
}

// ==========================================================================
// ANONYMOUS VISITOR TRACKING & SESSION ANALYTICS
// ==========================================================================
function getOrCreateVisitorId() {
    let vid = safeStorage.getItem("kyu_campus_visitor_id");
    if (!vid) {
        vid = "usr_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        safeStorage.setItem("kyu_campus_visitor_id", vid);
    }
    return vid;
}
const currentVisitorId = getOrCreateVisitorId();

// Ping visit on startup
fetch("/api/analytics/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        visitorId: currentVisitorId,
        path: window.location.pathname,
        userAgent: navigator.userAgent
    })
}).catch(() => {});

// ==========================================================================
// KYAMBOGO CAMPUS AI GUIDE & NAVIGATOR CONTROLLER
// ==========================================================================
const campusAiModal = document.getElementById("campusAiModal");
const campusAiModalClose = document.getElementById("campusAiModalClose");
const campusAiForm = document.getElementById("campusAiForm");
const campusAiInput = document.getElementById("campusAiInput");
const campusAiMessages = document.getElementById("campusAiMessages");
const campusAiSendBtn = document.getElementById("campusAiSendBtn");
const campusAiSendText = document.getElementById("campusAiSendText");

// Conversation Memory for Multi-Turn AI dialogue
let campusAiHistory = [];

// Helper: Calculate distance in meters between two lat/lng pairs
function getHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// Get user location spatial context and nearest campus buildings
function getUserLocationContext() {
    let lat = null, lng = null, accuracy = null;
    if (userMarker) {
        const pt = userMarker.getLatLng();
        lat = pt.lat;
        lng = pt.lng;
    }

    if (lat === null || lng === null) {
        return null;
    }

    const bList = (buildings && buildings.length ? buildings : defaultBuildings);
    if (!bList || !bList.length) return null;

    const sorted = bList.map(b => {
        const d = (map && typeof map.distance === "function") 
            ? Math.round(map.distance([lat, lng], [b.latitude, b.longitude]))
            : getHaversineDistanceMeters(lat, lng, b.latitude, b.longitude);
        return {
            buildingId: b.buildingId,
            name: b.name,
            type: b.type,
            distanceMeters: d,
            latitude: b.latitude,
            longitude: b.longitude
        };
    }).sort((a, b) => a.distanceMeters - b.distanceMeters);

    const nearest = sorted[0];
    const top3 = sorted.slice(0, 3);

    return {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        nearestBuilding: nearest,
        nearbyBuildings: top3
    };
}

// Interactive Location Requester for AI
window.requestUserLocationForAi = function(callbackPrompt = "Where am I located on campus?") {
    showStatus("📍 Requesting GPS position for campus AI guide...");
    if (!navigator.geolocation) {
        showStatus("Geolocation is not supported by your browser.");
        submitCampusAiQuery(callbackPrompt);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = pos.coords.accuracy;

            setUserLocationMarker(lat, lng, accuracy, "You are here");
            map.setView([lat, lng], 18, { animate: true });
            showStatus("📍 Location detected! Analyzing campus surroundings...");
            submitCampusAiQuery(callbackPrompt);
        },
        (err) => {
            console.warn("GPS request notice:", err.message);
            // In case of error/denial, provide central campus reference location
            if (!userMarker) {
                const campusCenterLat = 0.3476;
                const campusCenterLng = 32.6316;
                setUserLocationMarker(campusCenterLat, campusCenterLng, 25, "Campus Reference Point");
                map.setView([campusCenterLat, campusCenterLng], 18, { animate: true });
            }
            showStatus("Using Kyambogo Central Campus as your reference point.");
            submitCampusAiQuery(callbackPrompt);
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
};

// Text-to-Speech Audio Voice Assistant
window.speakCampusAiText = function(text) {
    if (!window.speechSynthesis) {
        showStatus("Speech synthesis not supported in this browser.");
        return;
    }
    window.speechSynthesis.cancel();
    const clean = text.replace(/<[^>]*>/g, '').replace(/[*_#]/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    showStatus("🔊 Playing voice guidance...");
};

window.openCampusAiModal = function(initialQuery = "") {
    if (campusAiModal) {
        campusAiModal.style.display = "flex";
        campusAiModal.style.visibility = "visible";
        campusAiModal.style.opacity = "1";
    }
    if (initialQuery && campusAiInput) {
        campusAiInput.value = initialQuery;
        submitCampusAiQuery(initialQuery);
    } else if (campusAiInput) {
        setTimeout(() => campusAiInput.focus(), 100);
    }
};

window.closeCampusAiModal = function() {
    if (campusAiModal) campusAiModal.style.display = "none";
    if (window.speechSynthesis) window.speechSynthesis.cancel();
};

if (campusAiModalClose && campusAiModal) {
    campusAiModalClose.addEventListener("click", window.closeCampusAiModal);
    campusAiModal.addEventListener("click", (e) => {
        if (e.target === campusAiModal) window.closeCampusAiModal();
    });
}

document.querySelectorAll(".ai-chip-prompt").forEach(chip => {
    chip.addEventListener("click", () => {
        const prompt = chip.getAttribute("data-prompt");
        if (prompt && campusAiInput) {
            campusAiInput.value = prompt;
            submitCampusAiQuery(prompt);
        }
    });
});

async function submitCampusAiQuery(question) {
    const q = (question || (campusAiInput ? campusAiInput.value : "")).trim();
    if (!q || !campusAiMessages) return;

    if (campusAiInput) campusAiInput.value = "";

    // Append user message
    const userMsg = document.createElement("div");
    userMsg.className = "ai-msg ai-user-msg";
    userMsg.innerHTML = `<div class="ai-msg-bubble">${q}</div>`;
    campusAiMessages.appendChild(userMsg);

    // Append bot loading bubble
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "ai-msg ai-bot-msg";
    loadingMsg.innerHTML = `<div class="ai-msg-bubble"><span>✨ Analyzing campus map & location...</span></div>`;
    campusAiMessages.appendChild(loadingMsg);
    campusAiMessages.scrollTop = campusAiMessages.scrollHeight;

    if (campusAiSendBtn) campusAiSendBtn.disabled = true;
    if (campusAiSendText) campusAiSendText.textContent = "Thinking...";

    // Extract live spatial location context
    let userLocation = getUserLocationContext();

    // If user specifically asked about their location and GPS is not active, try a quick single-shot location query
    const isAskingLocation = /where am i|where i am|my location|where located|closest building|nearest to me/i.test(q);
    if (isAskingLocation && !userLocation && navigator.geolocation) {
        try {
            await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    pos => {
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        setUserLocationMarker(lat, lng, pos.coords.accuracy || 15, "You are here");
                        userLocation = getUserLocationContext();
                        resolve();
                    },
                    () => resolve(),
                    { enableHighAccuracy: true, timeout: 1500 }
                );
            });
        } catch (_) {}
    }

    try {
        const res = await fetch("/api/ai/ask-campus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: q,
                visitorId: currentVisitorId,
                userLocation: userLocation,
                history: campusAiHistory.slice(-6)
            })
        });
        const data = await res.json();
        
        let answerText = "I found information about that on campus.";
        let building = null;
        let actionType = "info";
        let followUpSuggestions = [];

        if (data.success && data.data) {
            answerText = data.data.answer || answerText;
            building = data.data.building;
            actionType = data.data.actionType || "info";
            followUpSuggestions = data.data.followUpSuggestions || [];
        }

        // Format markdown bolding into HTML
        let formattedAnswer = answerText
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>');

        // Location badge if near a known building
        let locationBadgeHtml = "";
        if (userLocation && userLocation.nearestBuilding && (actionType === "current_location" || isAskingLocation)) {
            locationBadgeHtml = `
                <div class="ai-location-badge">
                    <span>📍 GPS Active</span> &bull; 
                    <span>Near ${userLocation.nearestBuilding.name} (~${userLocation.nearestBuilding.distanceMeters}m)</span>
                </div>
            `;
        }

        // Build interactive action buttons
        let actionsHtml = "";
        const actionButtons = [];

        if (actionType === "request_location" || (isAskingLocation && !userLocation)) {
            actionButtons.push(`
                <button type="button" class="ai-action-btn-detect" onclick="window.requestUserLocationForAi && window.requestUserLocationForAi()">
                    📍 Detect My Location & Surroundings
                </button>
            `);
        }

        if (building && typeof building.latitude === "number") {
            const safeName = (building.name || "Campus Destination").replace(/'/g, "\\'");
            actionButtons.push(`
                <button type="button" class="ai-action-btn-walk" onclick="window.closeCampusAiModal(); window.selectDestination('${safeName}', ${building.latitude}, ${building.longitude});">
                    🧭 Walk Here
                </button>
            `);
            actionButtons.push(`
                <button type="button" class="ai-action-btn-map" onclick="window.closeCampusAiModal(); map.setView([${building.latitude}, ${building.longitude}], 18); const m = (window.buildings || []).find(x => x.buildingId === '${building.buildingId}'); if (m && m.marker) m.marker.openPopup();">
                    📍 Show on Map
                </button>
            `);
            actionButtons.push(`
                <button type="button" class="ai-action-btn-info" onclick="window.closeCampusAiModal(); const b = (buildings || defaultBuildings).find(x => x.buildingId === '${building.buildingId}'); if (b) showBuildingDetail(b);">
                    🏢 Building Info
                </button>
            `);
        }

        if (actionType === "current_location" && userMarker) {
            actionButtons.push(`
                <button type="button" class="ai-action-btn-map" onclick="window.closeCampusAiModal(); map.setView(userMarker.getLatLng(), 18); userMarker.openPopup();">
                    📍 Pinpoint Me on Map
                </button>
            `);
        }

        // Voice Read-Aloud Button
        const cleanSpeechText = answerText.replace(/['"\\]/g, ' ').substring(0, 300);
        actionButtons.push(`
            <button type="button" class="ai-action-btn-speak" title="Listen to answer" onclick="window.speakCampusAiText('${cleanSpeechText}')">
                🔊 Listen
            </button>
        `);

        if (actionButtons.length > 0) {
            actionsHtml = `<div class="ai-bot-card-action">${actionButtons.join("")}</div>`;
        }

        // Interactive Follow-Up Chips
        let followUpsHtml = "";
        if (followUpSuggestions && followUpSuggestions.length > 0) {
            const chips = followUpSuggestions.map(s => {
                const safePrompt = s.replace(/'/g, "\\'");
                return `<button type="button" class="ai-followup-chip" onclick="submitCampusAiQuery('${safePrompt}')">${s}</button>`;
            }).join("");
            followUpsHtml = `
                <div class="ai-msg-followups">
                    <span style="font-size: 10px; color: #64748b; font-weight: 700; width: 100%; margin-bottom: 2px;">SUGGESTED QUESTIONS:</span>
                    ${chips}
                </div>
            `;
        }

        loadingMsg.innerHTML = `
            <div class="ai-msg-bubble">
                ${locationBadgeHtml}
                <p style="margin: 0; line-height: 1.45;">${formattedAnswer}</p>
                ${actionsHtml}
                ${followUpsHtml}
            </div>
        `;

        // Update conversation history
        campusAiHistory.push({ role: "user", text: q });
        campusAiHistory.push({ role: "model", text: answerText });
        if (campusAiHistory.length > 10) campusAiHistory = campusAiHistory.slice(-10);

    } catch (err) {
        loadingMsg.innerHTML = `
            <div class="ai-msg-bubble" style="color: #b91c1c;">
                Sorry, I could not connect to campus AI right now: ${err.message}
            </div>
        `;
    } finally {
        if (campusAiSendBtn) campusAiSendBtn.disabled = false;
        if (campusAiSendText) campusAiSendText.textContent = "Send ✈️";
        campusAiMessages.scrollTop = campusAiMessages.scrollHeight;
    }
}

if (campusAiForm) {
    campusAiForm.addEventListener("submit", (e) => {
        e.preventDefault();
        submitCampusAiQuery();
    });
}




