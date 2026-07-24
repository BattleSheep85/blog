#!/usr/bin/env node
// build-harvest-products.mjs — one-off builder for benchmarks/ft-data/harvest-products.txt.
// Combines concrete product names pulled from eval/real-world-benchmark.json
// (expert `primary_picks` / `budget_pick`, already curated + sourced) with a
// manually curated top-up list spanning the categories the teacher-label
// harvest needs diversity across (audio/home/kitchen/computing/fitness/
// outdoor/baby/tools/etc). Deduped, written one product per line.
//
//   node benchmarks/build-harvest-products.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_PATH = join(__dirname, 'ft-data', 'harvest-products.txt');

function fromRealWorldBenchmark() {
  const path = join(ROOT, 'eval', 'real-world-benchmark.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const names = [];
  for (const q of data.queries || []) {
    for (const src of q.sources || []) {
      for (const pick of src.primary_picks || []) names.push(pick);
      if (src.budget_pick) names.push(src.budget_pick);
    }
  }
  return names;
}

// Manually curated top-up list: realistic, specific, buyable product names
// spanning categories the seed data under-represents. Kept flat/alphabetical
// per category for easy audit.
const TOPUP_PRODUCTS = [
  // Audio
  'Sony WF-1000XM5', 'Anker Soundcore Space A40', 'Anker Soundcore Liberty 4 NC',
  'Bose QuietComfort Earbuds II', 'JBL Flip 6', 'JBL Charge 5', 'Sonos Era 100',
  'Marshall Emberton II', 'Ultimate Ears Boom 3', 'Sennheiser Momentum 4',
  'Beats Studio Pro', 'Apple AirPods Pro 2', 'Samsung Galaxy Buds3 Pro',
  'Jabra Elite 10', 'Nothing Ear (a)', 'Skullcandy Crusher Evo', 'Bang & Olufsen Beoplay EX',
  'Shure SM7B', 'Audio-Technica ATH-M50x', 'Focal Bathys',
  // Home / Kitchen
  'Ninja Foodi 9-in-1', 'Instant Pot Duo Plus', 'Vitamix 5200', 'KitchenAid Artisan Stand Mixer',
  'Breville Barista Express', 'Cuisinart Food Processor 14-Cup', 'Le Creuset Dutch Oven 5.5qt',
  'Lodge Cast Iron Skillet 12-inch', 'Zojirushi Rice Cooker NS-TSC10', 'Ninja Speedi Rapid Cooker',
  'Cosori Air Fryer Pro LE', 'Philips Air Fryer XXL', 'Nespresso Vertuo Next',
  'Keurig K-Elite', 'OXO Good Grips Salad Spinner', 'Yeti Rambler 20oz Tumbler',
  'Stanley Quencher 40oz', 'Dyson V15 Detect', 'Shark Navigator Lift-Away',
  'iRobot Roomba j7+', 'Roborock S8 Pro Ultra', 'Eufy RoboVac 11S', 'Bissell CrossWave',
  'Honeywell HPA300 Air Purifier', 'Levoit Core 300 Air Purifier', 'Dyson Pure Cool TP07',
  'Philips Hue White and Color Ambiance Starter Kit', 'TP-Link Kasa Smart Plug',
  'Nanoleaf Shapes Hexagons', 'Ring Video Doorbell Pro 2', 'Google Nest Hub Max',
  'Amazon Echo Dot 5th Gen', 'Ecobee Smart Thermostat Premium', 'Aqara Hub M2',
  // Computing / Electronics
  'Apple MacBook Air M3', 'Dell XPS 13', 'Lenovo ThinkPad X1 Carbon', 'ASUS ROG Zephyrus G14',
  'Framework Laptop 13', 'Microsoft Surface Laptop 6', 'HP Spectre x360',
  'Logitech MX Master 3S', 'Logitech MX Keys', 'Keychron K8 Pro', 'Keychron Q1 Pro',
  'Razer DeathAdder V3', 'SteelSeries Arctis Nova Pro', 'HyperX Cloud Alpha',
  'Samsung Odyssey G7 Monitor', 'LG UltraGear 27GP950', 'Dell UltraSharp U2723QE',
  'Anker 737 Power Bank', 'Anker PowerCore 26800', 'Belkin BoostCharge Pro 3-in-1',
  'Ugreen Nexode 65W GaN Charger', 'Synology DiskStation DS923+', 'UGREEN NASync DXP4800',
  'WD My Passport 2TB', 'Samsung T7 Shield SSD', 'TP-Link Deco X55 Mesh WiFi',
  'Eero Pro 6E', 'Netgear Orbi RBK853', 'ASUS ZenWiFi XT9',
  'Nintendo Switch OLED', 'Steam Deck OLED', 'ASUS ROG Ally X',
  'Elgato Stream Deck MK.2', 'Blue Yeti USB Microphone', 'Logitech StreamCam',
  // Fitness
  'Peloton Bike+', 'NordicTrack Commercial 1750 Treadmill', 'Bowflex SelectTech 552 Dumbbells',
  'Garmin Forerunner 265', 'Apple Watch Series 10', 'Fitbit Charge 6', 'Whoop 4.0',
  'Theragun Elite', 'Hyperice Hypervolt 2', 'Concept2 RowErg', 'TRX Pro4 Suspension Trainer',
  'Rogue Fitness Kettlebell', 'Manduka PRO Yoga Mat', 'Hydro Flask 32oz Wide Mouth',
  'CamelBak Chute Mag Water Bottle', 'Osprey Talon 22 Backpack',
  // Outdoor
  'Coleman Sundome 4-Person Tent', 'REI Co-op Half Dome SL Tent', 'YETI Tundra 45 Cooler',
  'Weber Spirit II E-310 Grill', 'Traeger Ironwood 650 Smoker', 'Solo Stove Bonfire',
  'Big Agnes Copper Spur HV UL2', 'Black Diamond Spot 400 Headlamp', 'Goal Zero Yeti 500X',
  'Jackery Explorer 1000 v2', 'Anker SOLIX C1000 Power Station', 'Garmin inReach Mini 2',
  'Patagonia Nano Puff Jacket', 'Merrell Moab 3 Hiking Boots', 'Salomon X Ultra 4 GTX',
  // Baby
  'Graco 4Ever DLX Car Seat', 'Chicco KeyFit 35 Infant Car Seat', 'UPPAbaby Vista V2 Stroller',
  'Baby Jogger City Mini GT2', 'Owlet Dream Sock', 'Nanit Pro Baby Monitor',
  'Fisher-Price Rock-n-Play', '4moms mamaRoo Bassinet', 'Baby Brezza Formula Pro Advanced',
  'Dr. Brown\'s Natural Flow Baby Bottles', 'Munchkin Miracle 360 Cup',
  // Tools
  'DeWalt DCD791D2 Drill Driver', 'Milwaukee M18 Fuel Impact Driver', 'Makita XFD131 Drill Kit',
  'Ryobi ONE+ 18V Cordless Drill', 'Bosch GLM 50 Laser Distance Measurer',
  'Craftsman V20 Cordless Drill', 'DeWalt DWE7491RS Table Saw', 'Milwaukee M12 Fuel Multi-Tool',
  'Stanley FatMax Tape Measure 25ft', 'Klein Tools Multimeter MM600',
  'WORX WG184 Hydroshot Pressure Washer', 'Greenworks 40V Cordless Lawn Mower',
  'EGO Power+ 56V String Trimmer', 'Honda EU2200i Generator',
  // Beauty / personal care
  'Dyson Airwrap Multi-Styler', 'Oral-B iO Series 9', 'Philips Sonicare DiamondClean',
  'Braun Series 9 Pro Electric Shaver', 'Waterpik Aquarius Water Flosser',
  'T3 AireLuxe Hair Dryer', 'Foreo Luna 3 Facial Cleansing Brush',
  // Gaming / Camera
  'Sony PlayStation 5 Pro', 'Xbox Series X', 'GoPro Hero 13 Black',
  'DJI Mini 4 Pro', 'Canon EOS R50', 'Sony Alpha a6400', 'Insta360 X4',
  // Furniture / office
  'Herman Miller Aeron Chair', 'Steelcase Leap V2', 'Secretlab Titan Evo 2022',
  'Uplift V2 Standing Desk', 'FlexiSpot E7 Standing Desk', 'Branch Ergonomic Chair',
  'IKEA Bekant Desk', 'Autonomous ErgoChair Pro',
  // Pet
  'Litter-Robot 4', 'PetSafe ScoopFree Ultra', 'Furbo 360 Dog Camera',
  'Whistle Go Explore GPS Dog Collar', 'Kong Classic Dog Toy',
  // Software / services (non-Amazon, is_buyable false facet still valid)
  '1Password', 'Bitwarden Premium', 'Dashlane', 'TurboTax Premium', 'H&R Block Deluxe',
  'ExpressVPN', 'NordVPN', 'Grammarly Premium', 'Todoist Pro', 'Notion Plus',
  // More audio/home top-ups to round out categories
  'Sonos Arc Soundbar', 'Bose Smart Soundbar 900', 'Vizio M-Series Elevate',
  'Samsung HW-Q990D Soundbar', 'LG C4 OLED TV', 'Samsung QN90D Neo QLED',
  'TCL QM8 Mini-LED TV', 'Roku Ultra 2024', 'Apple TV 4K',
  'Google Chromecast with Google TV', 'Nvidia Shield TV Pro',
  'Anker Nebula Capsule 3 Projector', 'Epson Home Cinema 2350',
  'Weber Genesis E-325s', 'Ninja Woodfire Outdoor Grill', 'Blackstone 36-inch Griddle',
  'Char-Broil Performance 4-Burner', 'Cuisinart CGG-306 Griddle',
  'Instant Vortex Plus Air Fryer', 'Ninja Creami Deluxe', 'Breville Smart Oven Air Fryer Pro',
  'GE Profile Opal 2.0 Nugget Ice Maker', 'Presto Salad Shooter', 'Vitamix Explorian E310',
  'Nutribullet Pro 900', 'KitchenAid Immersion Blender',
  'Samsung Bespoke Jet Vacuum', 'Tineco Floor One S5', 'Bissell Little Green Portable Cleaner',
  'Honeywell TurboForce Fan', 'Vornado 660 Air Circulator', 'Dreo Tower Fan',
  'De\'Longhi Pinguino Portable AC', 'Midea Duo Inverter Portable AC',
  'Ooni Koda 16 Pizza Oven', 'Cuisinart Griddler 5-in-1', 'Hamilton Beach Toaster Oven',
  'Presto Pressure Cooker 6qt', 'Anova Precision Cooker Nano',
  'Chemex Classic Series Coffee Maker', 'Baratza Encore Grinder', 'AeroPress Coffee Maker',
  'Cuisinart Coffee Center', 'Ninja Espresso & Coffee Barista System',
  'Garmin Edge 840 Bike Computer', 'Wahoo KICKR Core Smart Trainer', 'Zwift Ride',
  'Schwinn IC4 Indoor Cycling Bike', 'Bowflex Max Trainer M9',
  'ProForm Carbon TLX Treadmill', 'Sole F80 Treadmill',
  'Rogue Echo Bike', 'Marcy Adjustable Bench', 'Bala Bangles',
  'Under Armour HOVR Sonic 6 Running Shoes', 'Hoka Clifton 9', 'Brooks Ghost 16',
  'Vuori Ponto Performance Jogger', 'Lululemon Align Leggings',
  'Nikon Coolpix P1100', 'Canon PowerShot G7 X Mark III', 'Ricoh GR IIIx',
  'Peak Design Everyday Backpack', 'Manfrotto Befree Advanced Tripod',
  'Rode Wireless GO II', 'Elgato Wave:3 Microphone', 'Focusrite Scarlett 2i2',
  'Logitech C920s Webcam', 'Anker PowerConf S330 Speakerphone',
  'Samsung Galaxy S25 Ultra', 'Apple iPhone 16 Pro', 'Google Pixel 9 Pro',
  'OnePlus 13', 'Motorola Edge 50 Pro',
  'Apple iPad Air M2', 'Samsung Galaxy Tab S10', 'Amazon Fire HD 10',
  'Kindle Paperwhite', 'Kobo Clara Colour', 'reMarkable Paper Pro',
  'Withings Body+ Smart Scale', 'Eufy Smart Scale P3', 'Renpho Smart Scale',
  'Oura Ring Gen 4', 'Garmin Venu 3', 'Amazfit Balance',
  'Chicco Bravo Trio Travel System', 'Britax Boulevard ClickTight Car Seat',
  'Ergobaby Omni 360 Baby Carrier', 'Tushbaby Hip Seat Carrier',
  'Skip Hop Diaper Bag Backpack', 'Hatch Rest+ Sound Machine',
  'Baby Bjorn Bouncer Bliss', 'Graco Pack N Play',
  'Milwaukee M18 Fuel Circular Saw', 'DeWalt DCS391B Circular Saw',
  'Makita XT269M 18V Combo Kit', 'Ridgid R4221 Compound Miter Saw',
  'Bosch 18V EC Brushless Impact Driver', 'Craftsman CMCF910 Impact Wrench',
  'Klein Tools Wire Stripper', 'Fluke 117 Multimeter',
  'Husqvarna 128LD String Trimmer', 'Toro Recycler 22-inch Mower',
  'Sun Joe SPX3000 Pressure Washer', 'Ryobi RY142300 Pressure Washer',
];

function main() {
  const combined = [...fromRealWorldBenchmark(), ...TOPUP_PRODUCTS];
  const seen = new Set();
  const deduped = [];
  for (const name of combined) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(name.trim());
  }
  const outDir = dirname(OUT_PATH);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT_PATH, deduped.join('\n') + '\n');
  console.error(`[build-harvest-products] wrote ${deduped.length} products to ${OUT_PATH}`);
}

main();
