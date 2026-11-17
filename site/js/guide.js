/* Alchemist Detailing — the Products guide (#admin-guide, the console's "Products" screen), for the admin and managers.
   The owner, Nov 17, 2026: "Make an admin sided description of what products to use and the order". Read-only and
   in the page: no database. The content is the owner's product list and his Nov 17 update (Green Star is the pre-wash,
   Gentle Snow Foam the contact wash; he has an extractor; the wet vac with diluted Green Star is for floors with stuck
   dirt), the plan's product notes and the research behind them. A mix appears only where a source gives one; otherwise
   "follow the label". "have" = he owns it; "after you buy" = on his buy list. Built from the build's guide-content.json
   (make_guide.py); change the content there, or here, and keep the two the same. Open questions for the owner close
   the screen. */
(function () {
  'use strict';
  const GUIDE = {
 "title": "Products and order",
 "updated": "2026-11-17",
 "intro": "What to use and in what order, for each service, add-on and inside answer. \"have\" = you own it now; \"after you buy\" = on your buy list. Mixes: 1:20 means 1 part product to 20 parts water. Where it says \"follow the label\", we had no confirmed figure. The bottle's label always wins.",
 "products": [
  {
   "name": "Green Star (Koch)",
   "status": "have",
   "use": "pre-wash, tires, mats, strong interior cleaner, bugs, wheel wells, engine bay, stuck floor dirt (wet vac)"
  },
  {
   "name": "Gentle Snow Foam (Koch)",
   "status": "have",
   "use": "contact wash (bucket)"
  },
  {
   "name": "Brake Buster",
   "status": "have",
   "use": "wheels (standard now; alternate after Magic Wheel Cleaner)"
  },
  {
   "name": "Terminator",
   "status": "have",
   "use": "stain spot spray (fabric and carpet)"
  },
  {
   "name": "Carpet Bomber",
   "status": "have",
   "use": "seat and carpet shampoo"
  },
  {
   "name": "Pol Star (Koch)",
   "status": "have",
   "use": "leather and plastics; leather/vinyl spots"
  },
  {
   "name": "Gummifix (Koch)",
   "status": "have",
   "use": "rubber dressing: door seals only"
  },
  {
   "name": "S0.03 (Koch)",
   "status": "have",
   "use": "hydrophobic finish: Full Detail sealant foam"
  },
  {
   "name": "Leather conditioner",
   "status": "have",
   "use": "leather"
  },
  {
   "name": "PPF cleaner",
   "status": "have",
   "use": "clear film care"
  },
  {
   "name": "Glass cleaner (\"Quik\")",
   "status": "have",
   "use": "glass inside and out"
  },
  {
   "name": "Magic Wheel Cleaner (Koch)",
   "status": "after you buy",
   "use": "standard wheels"
  },
  {
   "name": "Multi Star N (Koch)",
   "status": "after you buy",
   "use": "heavy wheels, heavy pre-clean"
  },
  {
   "name": "Reactive Rust Remover (Koch)",
   "status": "after you buy",
   "use": "iron decon, as needed"
  },
  {
   "name": "Quick & Shine (Koch)",
   "status": "after you buy",
   "use": "glossy trim; exterior finish spray"
  },
  {
   "name": "Top Star (Koch)",
   "status": "after you buy",
   "use": "dash and plastics protectant (if you no longer have it)"
  },
  {
   "name": "Tire Glaze (Koch)",
   "status": "after you buy",
   "use": "tire shine"
  },
  {
   "name": "Protector Wax (Koch)",
   "status": "after you buy",
   "use": "gloss wax foam add-on"
  },
  {
   "name": "Eulex (Koch)",
   "status": "after you buy",
   "use": "tar, sap, sticker glue"
  },
  {
   "name": "Motorplast (Koch)",
   "status": "after you buy",
   "use": "engine bay dressing"
  }
 ],
 "sections": [
  {
   "id": "basic_wash",
   "title": "Basic Wash",
   "kind": "service",
   "card": "Foam pre-wash, two-bucket hand wash, rinse, hand dry. Wheels and tires only rinsed with the car.",
   "steps": [
    {
     "step": 1,
     "product": "Green Star (pre-wash)",
     "how": "Pre-wash foam or spray over the whole car. Let it work, never let it dry, then rinse. Mix: follow the label (Koch lists 1:5 to 1:30 outside; weaker for light dirt).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Gentle Snow Foam (contact wash)",
     "how": "Two-bucket hand wash: one soap bucket, one rinse bucket, grit guards. Koch: 50 ml per 10 L bucket. Top down; a second mitt for the lower panels.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Water",
     "how": "Rinse the whole car, top down.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Drying towels + blower",
     "how": "Hand dry. Blow out mirrors, handles, badges and gaps.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Not included: wheel and tire scrubbing, tire shine, bug and tar removal, window cleaning. If the customer wants wheels, that's the Wheels & Tire Shine add-on ($20).",
    "Cars with normal road dirt. A very dirty car: tell the customer before you start (Hand Wash, or a price first)."
   ]
  },
  {
   "id": "hand_wash",
   "title": "Hand Wash",
   "kind": "service",
   "card": "Thick foam, two-bucket hand wash, wheels and tires cleaned, tire shine, rinsed, hand-dried and blown out, outside glass.",
   "steps": [
    {
     "step": 1,
     "product": "Brake Buster",
     "how": "Wheel faces and barrels. 1 part Brake Buster to 5 parts water for normal wheels; straight for heavy brake dust (store listings: the label gives no mix). Brush, rinse. Use the dirty-set towels only. After you buy Magic Wheel Cleaner: use it here instead (mix: follow the label); Brake Buster stays as the alternate.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Green Star",
     "how": "Tires: spray, scrub with the tire brush, rinse. Mix: follow the label (Koch lists 1:5 to 1:30 for outside work, never stronger than 1:3).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Green Star (pre-wash)",
     "how": "Pre-wash foam or spray over the whole car. Let it work, never let it dry, then rinse. Mix: follow the label (Koch lists 1:5 to 1:30 outside; weaker for light dirt).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Gentle Snow Foam (contact wash)",
     "how": "Two-bucket hand wash: one soap bucket, one rinse bucket, grit guards. Koch: 50 ml per 10 L bucket. Top down; a second mitt for the lower panels.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 5,
     "product": "Water",
     "how": "Rinse the whole car, top down.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 6,
     "product": "Drying towels + blower",
     "how": "Hand dry. Blow out mirrors, handles, badges and gaps.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 7,
     "product": "Your glass cleaner",
     "how": "Outside glass. Mix: follow the label. Must be safe on tinted windows.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 8,
     "product": "Koch Tire Glaze",
     "how": "Tire shine on an applicator pad. Let it sit, then wipe off the extra so it doesn't fling. Never on the tread.",
     "when": "every job",
     "status": "after you buy"
    }
   ],
   "notes": [
    "Wheels first, so wheel grime doesn't splash a clean car (our suggested order: tell us if you work another way).",
    "Wheel and tire towels and brushes never touch paint."
   ]
  },
  {
   "id": "inside_out",
   "title": "Inside & Out",
   "kind": "service",
   "card": "Everything in the Hand Wash, plus the inside of the Interior Clean.",
   "steps": [
    {
     "step": 1,
     "product": "Brake Buster",
     "how": "Wheel faces and barrels. 1 part Brake Buster to 5 parts water for normal wheels; straight for heavy brake dust (store listings: the label gives no mix). Brush, rinse. Use the dirty-set towels only. After you buy Magic Wheel Cleaner: use it here instead (mix: follow the label); Brake Buster stays as the alternate.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Green Star",
     "how": "Tires: spray, scrub with the tire brush, rinse. Mix: follow the label (Koch lists 1:5 to 1:30 for outside work, never stronger than 1:3).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Green Star (pre-wash)",
     "how": "Pre-wash foam or spray over the whole car. Let it work, never let it dry, then rinse. Mix: follow the label (Koch lists 1:5 to 1:30 outside; weaker for light dirt).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Gentle Snow Foam (contact wash)",
     "how": "Two-bucket hand wash: one soap bucket, one rinse bucket, grit guards. Koch: 50 ml per 10 L bucket. Top down; a second mitt for the lower panels.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 5,
     "product": "Water",
     "how": "Rinse the whole car, top down.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 6,
     "product": "Drying towels + blower",
     "how": "Hand dry. Blow out mirrors, handles, badges and gaps.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 7,
     "product": "Your glass cleaner",
     "how": "Outside glass. Mix: follow the label. Must be safe on tinted windows.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 8,
     "product": "Koch Tire Glaze",
     "how": "Tire shine on an applicator pad. Let it sit, then wipe off the extra so it doesn't fling. Never on the tread.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 9,
     "product": "By hand",
     "how": "Take out the mats and loose items; set the customer's things aside.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 10,
     "product": "Vacuum",
     "how": "Seats, carpets and trunk. Top down, front to back.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 11,
     "product": "Green Star",
     "how": "Mats scrubbed and rinsed. Rubber mats are left DRY and non-slip: never dressed. Mix: follow the label (Koch lists 1:10 to 1:20 inside).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 12,
     "product": "Pol Star",
     "how": "Dash, doors, console and cup holders wiped (your pick for plastics and leather). Mix: Koch lists 1:5 heavy to 1:20 light.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 13,
     "product": "Green Star (strong APC)",
     "how": "Only where plastics are really dirty. Koch lists 1:10 to 1:20 inside. Wipe it off; never let it dry.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 14,
     "product": "Quick & Shine",
     "how": "Glossy trim (piano black, screens, gauge glass): spray the towel, not the surface. Mix: follow the label.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 15,
     "product": "Koch Top Star",
     "how": "Protectant on the dash and trim, thin, with an applicator pad (a few ml per surface). Satin finish. Nothing slick on the pedals.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 16,
     "product": "Your glass cleaner",
     "how": "Inside windows and mirrors. Must be safe on tinted windows.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 17,
     "product": "Vacuum",
     "how": "Last pass; mats back in, dry.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Outside first, then inside (our suggested order: tell us if you do the inside first).",
    "Gloss wax foam, if booked, goes on after the contact wash and before the final dry (see the add-on)."
   ]
  },
  {
   "id": "full_detail",
   "title": "Full Detail",
   "kind": "service",
   "card": "Inside & Out plus: bug and road-grime pre-soak, wheel wells scrubbed, water-repellent sealant foam (S0.03), seats and carpets shampooed and the dirty water pulled back out with an extractor, leather cleaned and conditioned, vents/seams/console steamed and brushed, door seals dressed.",
   "steps": [
    {
     "step": 1,
     "product": "Green Star (bug and road-grime pre-soak)",
     "how": "Front end, mirrors and lower panels. About 1:5 for bugs (Koch's blog). Leave a few minutes; never let it dry; not on hot panels.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Green Star (wheel wells)",
     "how": "Long-handled wheel-well brush, then rinse. Strong end of the label range (about 1:5 to 1:10).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Brake Buster",
     "how": "Wheel faces and barrels. 1 part Brake Buster to 5 parts water for normal wheels; straight for heavy brake dust (store listings: the label gives no mix). Brush, rinse. Use the dirty-set towels only. After you buy Magic Wheel Cleaner: use it here instead (mix: follow the label); Brake Buster stays as the alternate.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Green Star",
     "how": "Tires: spray, scrub with the tire brush, rinse. Mix: follow the label (Koch lists 1:5 to 1:30 for outside work, never stronger than 1:3).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 5,
     "product": "Green Star (pre-wash)",
     "how": "Pre-wash foam or spray over the whole car. Let it work, never let it dry, then rinse. Mix: follow the label (Koch lists 1:5 to 1:30 outside; weaker for light dirt).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 6,
     "product": "Gentle Snow Foam (contact wash)",
     "how": "Two-bucket hand wash: one soap bucket, one rinse bucket, grit guards. Koch: 50 ml per 10 L bucket. Top down; a second mitt for the lower panels.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 7,
     "product": "Eulex",
     "how": "Tar, sap and sticker glue left after the wash: ready to use, on a dry cloth, rub the spot. Keep it off headlights, bare plastic and hot surfaces.",
     "when": "as needed",
     "status": "after you buy"
    },
    {
     "step": 8,
     "product": "Water",
     "how": "Rinse the whole car, top down.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 9,
     "product": "S0.03 (hydrophobic finish)",
     "how": "Foam it on the clean, wet car, then rinse. Detail King lists 1:50 to 1:150; your own foam-cannon mix sets the real amount.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 10,
     "product": "Drying towels + blower",
     "how": "Hand dry. Blow out mirrors, handles, badges and gaps.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 11,
     "product": "Your glass cleaner",
     "how": "Outside glass. Mix: follow the label. Must be safe on tinted windows.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 12,
     "product": "Koch Tire Glaze",
     "how": "Tire shine on an applicator pad. Let it sit, then wipe off the extra so it doesn't fling. Never on the tread.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 13,
     "product": "By hand",
     "how": "Take out the mats and loose items; set the customer's things aside.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 14,
     "product": "Green Star",
     "how": "Mats scrubbed and rinsed. Rubber mats are left DRY and non-slip: never dressed. Mix: follow the label (Koch lists 1:10 to 1:20 inside).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 15,
     "product": "Vacuum + dry brush",
     "how": "Vacuum seats and carpet, brushing them dry first to lift the dirt.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 16,
     "product": "Terminator",
     "how": "Only if Stain and spill removal is booked (up to 5 spots; see the add-on). Spot spray on stains only: straight from the bottle (stores say ready to use; if your bottle says concentrate, follow the label). About 3 minutes, keep it damp, then brush. Fabric and carpet only, never leather or vinyl.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 17,
     "product": "Carpet Bomber",
     "how": "Spray on seats and carpets (method and mix per the label; being confirmed from your bottle). Let it sit as the label says, then scrub with a brush.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 18,
     "product": "Extractor (plain water)",
     "how": "Plain water in the clean tank. Go over each area until the water coming back is clean. Your extractor's manual decides what may go in its tank. Watch the dirty tank for foam; empty it early.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 19,
     "product": "Air and time",
     "how": "Mist, don't flood. Seats stay damp a few hours: tell the customer.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 20,
     "product": "Pol Star",
     "how": "Leather seats and trim: clean with a soft brush or microfiber. Koch lists 1:5 heavy to 1:20 light. Wipe dry.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 21,
     "product": "Your leather conditioner",
     "how": "Thin coat, worked in with a pad, left to dry. Mix: follow the label.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 22,
     "product": "Pol Star",
     "how": "Dash, doors, console and cup holders wiped (your pick for plastics and leather). Mix: Koch lists 1:5 heavy to 1:20 light.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 23,
     "product": "Green Star (strong APC)",
     "how": "Only where plastics are really dirty. Koch lists 1:10 to 1:20 inside. Wipe it off; never let it dry.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 24,
     "product": "Quick & Shine",
     "how": "Glossy trim (piano black, screens, gauge glass): spray the towel, not the surface. Mix: follow the label.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 25,
     "product": "Koch Top Star",
     "how": "Protectant on the dash and trim, thin, with an applicator pad (a few ml per surface). Satin finish. Nothing slick on the pedals.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 26,
     "product": "Your glass cleaner",
     "how": "Inside windows and mirrors. Must be safe on tinted windows.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 27,
     "product": "Steamer + brush",
     "how": "Console, vents, seams and cup holders steamed and brushed; wipe as you go. Unplug the steamer while the vac or washer runs on the same power.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 28,
     "product": "Gummifix",
     "how": "Door seals ONLY, thin layer, wipe the extra off. Never on mats, pedals or anything a foot or hand grips.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 29,
     "product": "Vacuum",
     "how": "Last pass; mats back in, dry.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Cloth seats are shampooed; leather seats get the leather steps instead.",
    "Stain removal (up to 5 set-in spots) and the engine bay are NOT included: they are add-ons.",
    "Bring the generator as a second power source so the steamer can stay plugged in while you vacuum (plan)."
   ]
  },
  {
   "id": "interior_clean",
   "title": "Interior Clean",
   "kind": "service",
   "card": "The inside of Inside & Out, no wash.",
   "steps": [
    {
     "step": 1,
     "product": "By hand",
     "how": "Take out the mats and loose items; set the customer's things aside.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Vacuum",
     "how": "Seats, carpets and trunk. Top down, front to back.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Green Star",
     "how": "Mats scrubbed and rinsed. Rubber mats are left DRY and non-slip: never dressed. Mix: follow the label (Koch lists 1:10 to 1:20 inside).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Pol Star",
     "how": "Dash, doors, console and cup holders wiped (your pick for plastics and leather). Mix: Koch lists 1:5 heavy to 1:20 light.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 5,
     "product": "Green Star (strong APC)",
     "how": "Only where plastics are really dirty. Koch lists 1:10 to 1:20 inside. Wipe it off; never let it dry.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 6,
     "product": "Quick & Shine",
     "how": "Glossy trim (piano black, screens, gauge glass): spray the towel, not the surface. Mix: follow the label.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 7,
     "product": "Koch Top Star",
     "how": "Protectant on the dash and trim, thin, with an applicator pad (a few ml per surface). Satin finish. Nothing slick on the pedals.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 8,
     "product": "Your glass cleaner",
     "how": "Inside windows and mirrors. Must be safe on tinted windows.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 9,
     "product": "Vacuum",
     "how": "Last pass; mats back in, dry.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "No outside work. Water from your jugs if there's no faucet."
   ]
  },
  {
   "id": "interior_detail",
   "title": "Interior Detail",
   "kind": "service",
   "card": "The inside of the Full Detail, no wash.",
   "steps": [
    {
     "step": 1,
     "product": "By hand",
     "how": "Take out the mats and loose items; set the customer's things aside.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Green Star",
     "how": "Mats scrubbed and rinsed. Rubber mats are left DRY and non-slip: never dressed. Mix: follow the label (Koch lists 1:10 to 1:20 inside).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Vacuum + dry brush",
     "how": "Vacuum seats and carpet, brushing them dry first to lift the dirt.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Terminator",
     "how": "Only if Stain and spill removal is booked (up to 5 spots; see the add-on). Spot spray on stains only: straight from the bottle (stores say ready to use; if your bottle says concentrate, follow the label). About 3 minutes, keep it damp, then brush. Fabric and carpet only, never leather or vinyl.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 5,
     "product": "Carpet Bomber",
     "how": "Spray on seats and carpets (method and mix per the label; being confirmed from your bottle). Let it sit as the label says, then scrub with a brush.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 6,
     "product": "Extractor (plain water)",
     "how": "Plain water in the clean tank. Go over each area until the water coming back is clean. Your extractor's manual decides what may go in its tank. Watch the dirty tank for foam; empty it early.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 7,
     "product": "Air and time",
     "how": "Mist, don't flood. Seats stay damp a few hours: tell the customer.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 8,
     "product": "Pol Star",
     "how": "Leather seats and trim: clean with a soft brush or microfiber. Koch lists 1:5 heavy to 1:20 light. Wipe dry.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 9,
     "product": "Your leather conditioner",
     "how": "Thin coat, worked in with a pad, left to dry. Mix: follow the label.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 10,
     "product": "Pol Star",
     "how": "Dash, doors, console and cup holders wiped (your pick for plastics and leather). Mix: Koch lists 1:5 heavy to 1:20 light.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 11,
     "product": "Green Star (strong APC)",
     "how": "Only where plastics are really dirty. Koch lists 1:10 to 1:20 inside. Wipe it off; never let it dry.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 12,
     "product": "Quick & Shine",
     "how": "Glossy trim (piano black, screens, gauge glass): spray the towel, not the surface. Mix: follow the label.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 13,
     "product": "Koch Top Star",
     "how": "Protectant on the dash and trim, thin, with an applicator pad (a few ml per surface). Satin finish. Nothing slick on the pedals.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 14,
     "product": "Your glass cleaner",
     "how": "Inside windows and mirrors. Must be safe on tinted windows.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 15,
     "product": "Steamer + brush",
     "how": "Console, vents, seams and cup holders steamed and brushed; wipe as you go. Unplug the steamer while the vac or washer runs on the same power.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 16,
     "product": "Gummifix",
     "how": "Door seals ONLY, thin layer, wipe the extra off. Never on mats, pedals or anything a foot or hand grips.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 17,
     "product": "Vacuum",
     "how": "Last pass; mats back in, dry.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Same inside steps as the Full Detail.",
    "Stain removal is an add-on, not included."
   ]
  },
  {
   "id": "wheels_tire_shine",
   "title": "Add-on: Wheels & Tire Shine ($20, Basic Wash only)",
   "kind": "addon",
   "card": "Wheel faces and barrels, tires scrubbed, tire shine.",
   "steps": [
    {
     "step": 1,
     "product": "Brake Buster",
     "how": "Wheel faces and barrels. 1 part Brake Buster to 5 parts water for normal wheels; straight for heavy brake dust (store listings: the label gives no mix). Brush, rinse. Use the dirty-set towels only. After you buy Magic Wheel Cleaner: use it here instead (mix: follow the label); Brake Buster stays as the alternate.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Green Star",
     "how": "Tires: spray, scrub with the tire brush, rinse. Mix: follow the label (Koch lists 1:5 to 1:30 for outside work, never stronger than 1:3).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Water",
     "how": "Rinse the wheels before the pre-wash.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Koch Tire Glaze",
     "how": "Tire shine on an applicator pad. Let it sit, then wipe off the extra so it doesn't fling. Never on the tread.",
     "when": "every job",
     "status": "after you buy"
    }
   ],
   "notes": [
    "Do the wheels first, before the Basic Wash pre-wash; tire shine last, after drying."
   ]
  },
  {
   "id": "gloss_wax",
   "title": "Add-on: Gloss wax foam ($20)",
   "kind": "addon",
   "card": "Koch Protector Wax foamed on after the wash, then rinsed.",
   "steps": [
    {
     "step": 1,
     "product": "Koch Protector Wax",
     "how": "30 ml in 1 L of water in the foam cannon or sprayer (CarPro listing). Mix it fresh for each car; don't keep the mix. Foam on after the contact wash, rinse, then dry.",
     "when": "every job",
     "status": "after you buy"
    }
   ],
   "notes": [
    "Never promise how long it lasts.",
    "Basic Wash, Hand Wash and Inside & Out only (the Full Detail already gets S0.03)."
   ]
  },
  {
   "id": "engine_bay",
   "title": "Add-on: Engine bay clean ($50)",
   "kind": "addon",
   "card": "Engine bay cleaned, rinsed gently and dressed.",
   "steps": [
    {
     "step": 1,
     "product": "Plastic bags",
     "how": "Engine COOL. Cover the electrical parts (fuse box, alternator, open connectors).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Green Star",
     "how": "Spray, brush, wipe. About 1:10 (inside Koch's 1:5 to 1:30 range). Never let it dry.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Water",
     "how": "Gentle rinse: low pressure, no blasting the electrics.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Blower + towels",
     "how": "Blow the bay dry; take the bags off.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 5,
     "product": "Koch Motorplast",
     "how": "Engine bay protectant on the plastics and hoses. Mix: follow the label.",
     "when": "every job",
     "status": "after you buy"
    }
   ],
   "notes": [
    "Your list also names Green Star for engine bays (heavy exterior)."
   ]
  },
  {
   "id": "film_care",
   "title": "Add-on: Clear film (PPF) care ($15)",
   "kind": "addon",
   "card": "Every wash is already safe for clear film. This adds a hand clean of the film's edges and any spots on it, with a cleaner made for film.",
   "steps": [
    {
     "step": 1,
     "product": "Your PPF cleaner",
     "how": "After the wash: by hand with a soft microfiber along every film edge and on any spots. Mix: follow the label.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Don't pick at lifting edges; tell the customer.",
    "Eulex on film only after a hidden-spot test."
   ]
  },
  {
   "id": "leather_care",
   "title": "Add-on: Leather care ($35, Inside & Out and Interior Clean)",
   "kind": "addon",
   "card": "Leather cleaned and conditioned (already part of the Full Detail and Interior Detail).",
   "steps": [
    {
     "step": 1,
     "product": "Pol Star",
     "how": "Leather seats and trim: clean with a soft brush or microfiber. Koch lists 1:5 heavy to 1:20 light. Wipe dry.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Your leather conditioner",
     "how": "Thin coat, worked in with a pad, left to dry. Mix: follow the label.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Terminator never goes on leather or vinyl."
   ]
  },
  {
   "id": "stain_removal",
   "title": "Add-on: Stain and spill removal ($40, up to 5 spots)",
   "kind": "addon",
   "card": "Up to 5 set-in spots treated one by one.",
   "steps": [
    {
     "step": 1,
     "product": "Vacuum",
     "how": "Vacuum and dry-brush the spots first.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Terminator",
     "how": "Fabric and carpet spots: straight from the bottle, about 3 minutes, keep it damp, brush (a steamer after the wait is fine).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Extractor (plain water)",
     "how": "Pull the spot out with plain water until it comes back clean.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Pol Star",
     "how": "Spots on leather or vinyl instead of Terminator: Koch lists 1:5 for heavy dirt. Wipe dry.",
     "when": "as needed",
     "status": "have"
    }
   ],
   "notes": [
    "More than 5 spots? Tell the customer the price first.",
    "Test a hidden spot first on every fabric for colour bleed."
   ]
  },
  {
   "id": "cond_none",
   "title": "Inside answer: None",
   "kind": "inside",
   "card": "No extra work.",
   "steps": [
    {
     "step": 1,
     "product": "Nothing extra",
     "how": "Do the booked service.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "If what you find is different from what was chosen, tell the customer the price before you start; they choose: add it, or do what they booked without it."
   ]
  },
  {
   "id": "cond_pet_some",
   "title": "Inside answer: Some pet hair (+$30)",
   "kind": "inside",
   "card": "Hair on the seats and carpet that comes up with a vacuum and a rubber brush.",
   "steps": [
    {
     "step": 1,
     "product": "Rubber pet-hair brush or stone",
     "how": "Rake the hair into piles, seat by seat, then carpet.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 2,
     "product": "Vacuum",
     "how": "Vacuum the piles. Repeat until clean.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Do it before any shampoo: wet hair is harder to lift."
   ]
  },
  {
   "id": "cond_pet_lot",
   "title": "Inside answer: A lot of pet hair (+$60)",
   "kind": "inside",
   "card": "Hair woven into the fabric, on most seats and in the cargo area.",
   "steps": [
    {
     "step": 1,
     "product": "Rubber pet-hair brush or stone",
     "how": "Same as Some pet hair, slower and more passes; include the cargo area.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 2,
     "product": "Vacuum",
     "how": "Vacuum after each pass.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Only one of the two pet-hair answers per booking."
   ]
  },
  {
   "id": "cond_heavy_dirt",
   "title": "Inside answer: Heavy dirt, mud or sand (+$40)",
   "kind": "inside",
   "card": "Heavy dirt, mud or sand inside.",
   "steps": [
    {
     "step": 1,
     "product": "Vacuum + dry brush",
     "how": "Dry brush and vacuum first, several passes, to lift sand.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Green Star (diluted) + wet vac",
     "how": "Floors where dirt is stuck: spray diluted Green Star on the floor, agitate, vacuum it up with the wet vac (your method). Mix: follow the label.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Wet vac dirty tank",
     "how": "Watch for foam; empty early.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": [
    "Don't put Green Star and Terminator or Carpet Bomber on the same area in one go."
   ]
  },
  {
   "id": "cond_other",
   "title": "Inside answer: Other",
   "kind": "inside",
   "card": "The customer wrote a note; the booking went to Review.",
   "steps": [
    {
     "step": 1,
     "product": "Read the note",
     "how": "Price it before the job (the owner sets the price).",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Ask the owner",
     "how": "If it isn't clear what products to use, ask before you start.",
     "when": "as needed",
     "status": "have"
    }
   ],
   "notes": []
  },
  {
   "id": "heavy",
   "title": "Heavy jobs (your list)",
   "kind": "heavy",
   "card": "What to reach for when a car is worse than normal. Use as needed.",
   "steps": [
    {
     "step": 1,
     "product": "Multi Star N",
     "how": "Heavy wheels: rims at 1:3 to 1:10 (your list), then Magic Wheel Cleaner.",
     "when": "as needed",
     "status": "after you buy"
    },
    {
     "step": 2,
     "product": "Multi Star N",
     "how": "Heavy exterior pre-clean at 1:30 to 1:50 (your list); has corrosion inhibitors for sensitive parts like anodized aluminum.",
     "when": "as needed",
     "status": "after you buy"
    },
    {
     "step": 3,
     "product": "Reactive Rust Remover",
     "how": "Iron decon: sprayed undiluted, left 3 to 6 minutes (your list), rinsed. As needed, not every wash.",
     "when": "as needed",
     "status": "after you buy"
    },
    {
     "step": 4,
     "product": "Green Star",
     "how": "Engine bays and wheel arches (your list).",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 5,
     "product": "Eulex",
     "how": "Tar and sap (your list). Off headlights, bare plastic and hot surfaces.",
     "when": "as needed",
     "status": "after you buy"
    },
    {
     "step": 6,
     "product": "Terminator, then Carpet Bomber, then extractor",
     "how": "Heavy interior: vacuum and dry brush, Terminator on the stains, Carpet Bomber sprayed and scrubbed, extractor with plain water until it comes back clean, then dry.",
     "when": "as needed",
     "status": "have"
    },
    {
     "step": 7,
     "product": "Green Star (diluted) + wet vac",
     "how": "Floors with stuck dirt (your method).",
     "when": "as needed",
     "status": "have"
    }
   ],
   "notes": [
    "Figures marked \"your list\" come from the list you pasted; we haven't checked them against the bottles.",
    "Your list also mentions Alkali Wheel Cleaner (1:5 general, 1:3 heavy) as an option for heavy brake dust; it isn't on the buy list.",
    "No service on the menu charges for iron decon yet."
   ]
  },
  {
   "id": "safety",
   "title": "Safety",
   "kind": "safety",
   "card": "Read once; follow every job.",
   "steps": [
    {
     "step": 1,
     "product": "Gloves and eye protection",
     "how": "When you mix Green Star, Brake Buster and the wheel cleaners.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 2,
     "product": "Water only",
     "how": "Never mix chemicals with each other, only with water. Label every bottle with the product and the mix.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 3,
     "product": "Green Star",
     "how": "Never let it dry on paint, glass or trim; not on hot panels; test first on coated or anodized wheels.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 4,
     "product": "Eulex",
     "how": "Keep it off headlights (polycarbonate), bare plastic and hot surfaces. Fresh air. Test first on film and wraps.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 5,
     "product": "Gummifix",
     "how": "Door seals only. Never on mats or pedals: a slick mat or pedal can make a foot slip. Flammable: cap tight, closed tote, never in a hot parked car.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 6,
     "product": "Rubber mats",
     "how": "Scrubbed and left dry and non-slip. Nothing slick on pedals.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 7,
     "product": "Terminator",
     "how": "Fabric and carpet only; never leather or vinyl. Spot-test every fabric first. No guidance found for Alcantara or suede: stay off unless a spot test is fine.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 8,
     "product": "Extractor and wet vac",
     "how": "Foam can reach the motor: watch the dirty tank and empty it early. A defoamer, if you buy one, goes in the dirty tank only. Plain water in the clean tank unless the extractor's manual says otherwise.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 9,
     "product": "Seats and headliners",
     "how": "Mist, don't flood. Never soak a seat or headliner.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 10,
     "product": "Solvents (Eulex, Gummifix, Tire Glaze)",
     "how": "Caps tight, away from heat and sparks, used in fresh air.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 11,
     "product": "Texas heat",
     "how": "5 L jugs stay home; carry 1 L working bottles in a closed tote. No chemicals left in a hot car overnight.",
     "when": "every job",
     "status": "have"
    },
    {
     "step": 12,
     "product": "Protector Wax",
     "how": "Mix fresh for each car; don't store the mix.",
     "when": "every job",
     "status": "after you buy"
    },
    {
     "step": 13,
     "product": "Labels win",
     "how": "The label on the bottle beats this guide. Where it says \"follow the label\", we had no confirmed figure.",
     "when": "every job",
     "status": "have"
    }
   ],
   "notes": []
  }
 ],
 "questions": [
  "Order: we put wheels first, then the pre-wash, then the contact wash. Is that how you work? And on Inside & Out, outside first or inside first?",
  "Green Star pre-wash: foam cannon or pump sprayer, and how strong? (You said you don't know the dilution; Koch's label lists 1:5 to 1:30 outside.) Weaker on cars with a wax or coating?",
  "Terminator and Carpet Bomber: please send a photo of the front and back of both bottles. We think they are P&S \"Double Black\"; the back tells us if they are concentrates and how to mix.",
  "Your extractor: what model, and does it heat the water? We recommend plain water in its tank; its manual has the final say.",
  "Plastics: you said Pol Star for plastics and Green Star as the strong cleaner. Pol Star for normal plastics, Green Star only when really dirty: right?",
  "Quick & Shine vs Top Star: your list says Quick & Shine on glossy trim, Top Star on dash and plastics. Do you still have Top Star, or is it a buy? Should Quick & Shine also do screens, and outside glass?",
  "Your glass cleaner (\"Quik\"): what is it? A photo of the label, please. It must be safe on tinted windows.",
  "Your leather conditioner and PPF cleaner: which brands? A photo of each label.",
  "Tire shine: the Hand Wash promises one, and Gummifix isn't a tire shine. Until Tire Glaze arrives, what do you use?",
  "Gloss wax foam: until Protector Wax arrives, may WetGloss stand in, or do we hold the add-on?",
  "Reactive Rust Remover (iron decon): no service charges for it. Use it free when needed, or a priced extra later?",
  "When Multi Star N arrives, does it replace Green Star as the pre-wash on very dirty cars?",
  "Steamer on vents and seams: steam and brush only, or with a product (Pol Star or Green Star)?",
  "Tools: do you have a long-handled wheel-well brush and a rubber pet-hair brush or stone? (The guide marks them \"after you buy\".)",
  "Defoamer: buy one for the extractor and wet vac dirty tanks?"
 ]
};

  const KIND = { service: 'Services', addon: 'Add-ons', inside: 'Inside answers', heavy: 'Heavy jobs', safety: 'Safety' };
  const STATUS = { have: 'You have it', 'after you buy': 'After you buy' };
  function render() {
    const { el } = window.AlchemistUI;
    const tag = (status) => el('span.guide-tag', { class: status === 'have' ? 'have' : 'buy' }, STATUS[status] || status);
    const when = (w) => (w ? el('span.guide-when', { class: w === 'every job' ? 'every' : 'needed' }, w === 'every job' ? 'Every job' : 'As needed') : null);
    const groups = [];
    GUIDE.sections.forEach((s) => { let g = groups.find((x) => x.kind === s.kind); if (!g) groups.push(g = { kind: s.kind, list: [] }); g.list.push(s); });
    const jump = (id) => (e) => {
      e.preventDefault();
      const t = document.getElementById('guide-' + id);
      if (!t) return;
      t.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      const h = t.querySelector('h3'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    };
    const updated = new Date(GUIDE.updated + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const section = (s) => el('section.guide-sec', { id: 'guide-' + s.id, 'aria-labelledby': 'guide-h-' + s.id },
      el('h3.bk-h2', { id: 'guide-h-' + s.id }, s.title),
      s.card ? el('p.guide-card', s.card) : null,
      s.steps && s.steps.length ? el('ol.guide-steps', s.steps.map((x) => el('li.guide-step',
        el('span.guide-n.tnum', { 'aria-hidden': 'true' }, String(x.step)),
        el('div.guide-body',
          el('p.guide-prod', el('b', x.product), ' ', tag(x.status), ' ', when(x.when)),
          el('p.guide-how', x.how))))) : null,
      s.notes && s.notes.length ? el('ul.guide-notes', s.notes.map((n) => el('li', n))) : null);
    return el('div.guide',
      el('p.bk-note', GUIDE.intro),
      el('p.bk-muted', 'Updated ' + updated + '. Read-only. Changes go through the owner.'),
      el('div.guide-legend', { 'aria-label': 'Legend' }, tag('have'), tag('after you buy'), when('every job'), when('as needed')),
      el('nav.guide-jump', { 'aria-label': 'Jump to' }, groups.map((g) => el('div.guide-jump-row', el('span.guide-jump-k', KIND[g.kind] || g.kind),
        g.list.map((s) => el('a', { href: '#admin-guide', onclick: jump(s.id) }, s.title.replace(/^(Add-on|Inside answer): /, '')))))),
      el('section.guide-sec.guide-products', { 'aria-labelledby': 'guide-h-products' },
        el('h3.bk-h2', { id: 'guide-h-products' }, 'The products'),
        el('ul.guide-plist', GUIDE.products.map((p) => el('li', el('b', p.name), ' ', tag(p.status), el('span', p.use))))),
      groups.map((g) => el('div.guide-group', el('h2.eyebrow.guide-group-h', KIND[g.kind] || g.kind), g.list.map(section))),
      GUIDE.questions && GUIDE.questions.length ? el('section.guide-sec.guide-q', { 'aria-labelledby': 'guide-h-q' },
        el('h3.bk-h2', { id: 'guide-h-q' }, 'Open questions for you'),
        el('ol.guide-qlist', GUIDE.questions.map((q) => el('li', q)))) : null);
  }
  window.AlchemistGuide = { data: GUIDE, render };
})();
