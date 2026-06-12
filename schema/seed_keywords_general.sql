-- General-interest keyword seed batch (de-tech-ifying the flywheel).
-- High-intent "best X" queries across kitchen, home, fitness, outdoors, pets,
-- baby, auto, and personal care. Priority 70-80 — below the seasonal batch
-- (85-95) so time-sensitive pages publish first, above the long-tail tech
-- seeds. INSERT OR IGNORE keeps re-runs idempotent (keyword is UNIQUE).

INSERT OR IGNORE INTO keyword_queue (keyword, priority, status) VALUES
  -- Kitchen
  ('best air fryer under $150', 80, 'pending'),
  ('best espresso machine for beginners', 78, 'pending'),
  ('best blender for smoothies under $100', 76, 'pending'),
  ('best stand mixer for bread dough', 74, 'pending'),
  ('best cast iron skillet', 75, 'pending'),
  ('best chef knife under $100', 76, 'pending'),
  ('best drip coffee maker under $100', 77, 'pending'),
  ('best food storage containers', 70, 'pending'),
  ('best water filter pitcher', 74, 'pending'),
  ('best slow cooker for a family', 73, 'pending'),
  -- Home
  ('best robot vacuum for pet hair', 80, 'pending'),
  ('best air purifier for allergies', 79, 'pending'),
  ('best mattress for side sleepers', 80, 'pending'),
  ('best pillow for neck pain', 78, 'pending'),
  ('best cordless stick vacuum', 77, 'pending'),
  ('best humidifier for bedroom', 74, 'pending'),
  ('best blackout curtains', 70, 'pending'),
  ('best office chair for back pain', 79, 'pending'),
  ('best space heater for large room', 73, 'pending'),
  ('best dehumidifier for basement', 73, 'pending'),
  -- Tools and garage
  ('best cordless drill for home projects', 78, 'pending'),
  ('best socket set for beginners', 72, 'pending'),
  ('best wet dry vac for garage', 71, 'pending'),
  ('best pressure washer for driveway', 74, 'pending'),
  ('best garage shelving units', 70, 'pending'),
  ('best electric lawn mower for small yard', 75, 'pending'),
  ('best string trimmer battery powered', 72, 'pending'),
  -- Fitness and outdoors
  ('best running shoes for flat feet', 80, 'pending'),
  ('best adjustable dumbbells for home gym', 77, 'pending'),
  ('best yoga mat for bad knees', 72, 'pending'),
  ('best hiking boots for wide feet', 75, 'pending'),
  ('best camping tent for family of four', 74, 'pending'),
  ('best cooler for the money', 73, 'pending'),
  ('best sleeping bag for cold weather', 71, 'pending'),
  ('best insulated water bottle', 72, 'pending'),
  -- Pets
  ('best dog food for puppies', 78, 'pending'),
  ('best automatic cat litter box', 76, 'pending'),
  ('best dog crate for large dogs', 72, 'pending'),
  ('best flea treatment for cats', 73, 'pending'),
  -- Baby and family
  ('best convertible car seat', 79, 'pending'),
  ('best baby monitor without wifi', 76, 'pending'),
  ('best stroller for everyday use', 75, 'pending'),
  ('best high chair easy to clean', 71, 'pending'),
  -- Personal care
  ('best electric toothbrush under $100', 77, 'pending'),
  ('best sunscreen for sensitive skin', 75, 'pending'),
  ('best hair dryer for thick hair', 73, 'pending'),
  ('best beard trimmer', 72, 'pending');
