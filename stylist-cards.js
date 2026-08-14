// ── STYLIST CARD CONTENT ─────────────────────────
// The words from each stylist's A3 card, for the Stylist Cards view. Kate asked
// for the card layouts as HTML rather than exported images (2026-08-12), so this
// is the text; the head icons live in assets/staff/ and the lookup that pairs
// them is staff-profiles.js.
//
// PARSED, NOT TYPED. Extracted from _source/FINAL STYLIST CARD.pdf, which keeps
// selectable text. Three things made that harder than it sounds, all handled:
//   - Some pages put the name and role on one line ("Lizanie STYLIST"), others
//     split them across two.
//   - Most pull-quotes are wrapped in quote marks; Emma's and Robyn's are not, so
//     the quote is taken by position rather than punctuation.
//   - Review attributions use a hyphen, an en-dash, or on six cards a raw 0xAD
//     byte (a Latin-1 soft hyphen that is not valid UTF-8).
// The bullet lists come from the PDF's own bullet-dot positions: plain text
// flattens the three columns together, and layout text cannot tell a new bullet
// from a wrapped one. A text line with a dot at its y starts a bullet; one
// without continues the previous.
//
//   works  how many work photos exist for her under assets/staff/work/<name>-N.webp,
//          cropped from the strip on her card. Counts vary because the deck has
//          three layouts: most cards run six portraits, Areanne's four wider ones,
//          Katie's two landscapes.
//
// KATIE's card was redrawn on its own on 14 Aug 2026 ("Precision cutting" added to
// SPECIALISES IN) and came in as one A3 PDF, not a new deck — so the deck in _source
// is now OLDER than her card. That is handled by _source/card-updates/ and the
// --updates-only pass in scripts/split-stylist-cards.py; read its comment before
// re-exporting, or the next full run reverts her.
//
// Two card-design bugs are reproduced faithfully rather than silently corrected,
// because the fix belongs in Canva:
//   - RUTH's bullets sit beside "Transformation" with "Advanced Colour
//     Corrections" running on unbulleted. Almost certainly meant to read
//     "Luxury Colour Transformation" / "Advanced Colour Corrections".
//   - The contents page lists LUCY under Motor City's senior stylists, but her
//     own card and her head-icon filename both say Style Director.
const STYLIST_CARDS = {
 "KATE": {
  "role": "Style Director",
  "quote": "Thirteen years in, and still studying hair like it's day one.",
  "bio": "I'm from Ukraine, and I've been doing hair for thirteen years, eleven of them here in the UAE. When I'm not in the salon you'll find me at the gym, out running, rescuing cats, or deep in the latest hair education. I don't stand still.",
  "specialises": [
   "AirTouch",
   "Balayage",
   "Precision Highlighting"
  ],
  "bestFor": "Clients who want a true expert who keeps learning",
  "vibe": [
   "Energetic",
   "Dedicated",
   "Honest results"
  ],
  "loveMeIf": "you want someone who treats your hair as an ongoing study, not a one-off.",
  "mattersMost": "staying ahead, so you always get the current best, never last year's.",
  "inMyChair": "expect focus, energy and zero guesswork.",
  "review": "I ve been doing my hair with Kate for few months now and I've been totally happy with the results. She has great technique in balayage and hair colouring and offered me advice for the best results. I've always gotten compliments for my hair and I absolutely love it. Totally recommend!",
  "reviewBy": "Diana",
  "works": 6
 },
 "TEGAN": {
  "role": "Style Director",
  "quote": "Soft, natural colour that feels effortless, and a chair you can finally relax in.",
  "bio": "Originally from the UK, now living in Dubai and working in Abu Dhabi as a Style Director. I specialise in balayage and lived-in colour, soft and natural, the kind that's easy to maintain. A deep chat, a good laugh, or a quiet few hours to switch off? I'm happy with all three.",
  "specialises": [
   "Balayage",
   "Lived-In Colour"
  ],
  "bestFor": "Effortless Low-maintenance colour",
  "vibe": [
   "Warm",
   "Completely at ease",
   "Fun"
  ],
  "loveMeIf": "you want colour that looks effortless and a stylist who doesn't take herself too seriously.",
  "mattersMost": "my chair feels safe and welcoming, somewhere you can be fully yourself.",
  "inMyChair": "have a deep chat, a proper laugh, or switch off in the quiet. All welcome.",
  "review": "One of my favourite salons especially for hair services! I got a hair cut and full balayage with hairstylist Tegan, such a happy and joyful young lady. She explained every step and she colored my hair exactly how I wanted it and even better without damaging it in any way. I'd highly recommend her because of her excellent and professional work!",
  "reviewBy": "Shaikha",
  "works": 6
 },
 "KYLIE": {
  "role": "Senior Stylist",
  "quote": "Bright, healthy, shiny blonde, and a stylist you won't want to trust with anyone else.",
  "bio": "With twenty-one years behind the chair, over sixteen of them here in the Middle East, hair integrity is everything to me. I specialise in blondes and keeping those locks bright, healthy and shiny. Every appointment should feel fun and relaxed, and I'll always listen closely to get your look just right, whether you're blonde or brunette.",
  "specialises": [
   "Blondes",
   "Healthy",
   "Shiny Colour"
  ],
  "bestFor": "Brright Blonde Healthy and Glossy",
  "vibe": [
   "Fun",
   "Relaxed",
   "Easy to trust"
  ],
  "loveMeIf": "you want bright, glossy blonde without sacrificing your hair's health.",
  "mattersMost": "your hair's integrity, first and always.",
  "inMyChair": "relax, have fun, and know I'm listening to exactly what you want.",
  "review": "Kylie has been my hairdresser for years, and I honestly wouldn't trust anyone else with my hair. She's not only incredibly talented and creative, but also makes every appointment feel fun and relaxed. She really listens to what I want and always manages to get it just right whether I am a blonde or brunette. Couldn't recommend her enough!",
  "reviewBy": "Ash",
  "works": 6
 },
 "OLENA": {
  "role": "Senior Stylist",
  "quote": "Always dreamed of going short but never dared? That's exactly where I do my best work.",
  "bio": "From Ukraine and living in the UAE for nine years, I'm a Senior Stylist with around fifteen years in the industry. I specialise in haircuts and colour, with a personalised approach built around your style. I know so many women dream of a short cut but hold back out of fear, and my job is to make that change feel exciting and comfortable, not scary.",
  "specialises": [
   "Precision haircuts",
   "Colour"
  ],
  "bestFor": "A bold new colour or the short cut you've always imagined",
  "vibe": [
   "Attentive",
   "Reassuring",
   "Precise"
  ],
  "loveMeIf": "you want a real change and someone to make it feel exciting, not daunting.",
  "mattersMost": "that you feel informed and confident at every step, never in the dark.",
  "inMyChair": "expect a proper consultation, honest diagnostics, and a plan built just for you.",
  "review": "I've lived in Abu Dhabi for years and always heard of Tara Rose, but I stayed away because I assumed it was another pretentious salon that would overcharge me for mediocre work. I'm so upset it took me this long! I needed my roots done and toner for brassy highlights. Olena was THE loveliest. We talked through my hair before starting, she even gave me a quotation upfront which I've never had before, and we made a plan for my next visits. The salon is relaxed, the coffee is good, and the whole experience was amazing. It lived up to its reputation and I'm now a customer.",
  "reviewBy": "Veronica",
  "works": 6
 },
 "KATIE": {
  "role": "Senior Stylist",
  "quote": "Eighteen years in Abu Dhabi, and I still love seeing you walk out taller.",
  "bio": "I've lived in Abu Dhabi for over eighteen years. I'm family-oriented with three children, I love a proper chat, and I love a job start to finish. You can trust me with your hair, and I'll always be honest about it.",
  "specialises": [
   "Balayage",
   "Lived-In Colour",
   "Precision cutting"
  ],
  "bestFor": "Effortless Low-maintenance colour",
  "vibe": [
   "Warm",
   "Completely at ease",
   "Fun"
  ],
  "loveMeIf": "you want colour that looks effortless and a stylist who doesn't take herself too seriously.",
  "mattersMost": "my chair feels safe and welcoming, somewhere you can be fully yourself.",
  "inMyChair": "have a deep chat, a proper laugh, or switch off in the quiet. All welcome.",
  "review": "Katie has done my hair twice now with blonde balayage and a touch up and does an absolutely amazing job :) shes super friendly and chatty and does her absolute best to do your hair the way you want it, I'm definitely going to keep coming back because the service and quality of care here is better than anywhere else I've tried.",
  "reviewBy": "Fiore",
  "works": 2
 },
 "NIKKI": {
  "role": "Senior Stylist",
  "quote": "Twelve years of colour, and a chair where you're genuinely taken care of.",
  "bio": "I'm a hair artist with twelve years experience, specialising in blondes, balayage, vivid colour and extensions. I'm patient, detailoriented and always learning. Hair, to me, is about confidence and feeling your best, not just looking it.",
  "specialises": [
   "Blondes",
   "Balayage",
   "Vivids",
   "Extensions"
  ],
  "bestFor": "Clients who want detail and a real plan",
  "vibe": [
   "Calm",
   "Patient",
   "Attentive"
  ],
  "loveMeIf": "you want a stylist who plans for the long term, not just today.",
  "mattersMost": "honest consultations, so you always know what's realistic and healthy.",
  "inMyChair": "ask anything, feel listened to, and trust the process.",
  "review": "Honestly one of the best hair color experiences I've had Nikki at Khalifa Branch is sooo talented in hair coloring! My hair is naturally black and very hard to dye, but she managed to get the exact color I wanted and the result came out beyond my expectations. The color looks beautiful and my hair still feels healthy. Thank you Nikki for your amazing work and professionalism!",
  "reviewBy": "Fiore",
  "works": 6
 },
 "LIZANIE": {
  "role": "Stylist",
  "quote": "Colour that suits your life, not just the day you leave the salon.",
  "bio": "I'm from South Africa and I've been doing hair for almost seven years. I'm warm, easy-going and detail-oriented, and I love building real relationships with my clients. I create colour that looks beautiful and stays realistic to maintain.",
  "specialises": [
   "Blondes",
   "Balayage",
   "Brunettes",
   "Toning"
  ],
  "bestFor": "Healthy, dimensional, livable colour",
  "vibe": [
   "Warm",
   "Easy-going",
   "Attentive"
  ],
  "loveMeIf": "you want colour that's beautiful and realistic to keep up.",
  "mattersMost": "your hair's health and integrity, always.",
  "inMyChair": "feel heard, understood and completely comfortable.",
  "review": "I did my hair with Lizanie and she was amazing! She took the time to chat with me beforehand and really understand what I wanted. We did a full head of highlights and she absolutely nailed it, it's exactly what I had in mind! She kept checking in to make sure I was happy with everything, and I left feeling so confident and happy with my hair. Highly recommend her!",
  "reviewBy": "Marni",
  "works": 6
 },
 "CHALANI": {
  "role": "Stylist",
  "quote": "A look that enhances what's already yours, and still feels completely, authentically you.",
  "bio": "From Sri Lanka, with nine years of professional hairstyling in Dubai across different salons and every hair texture. I'm warm, caring and detail-oriented, and I take real time to listen so you feel comfortable and valued throughout. Whether we're enhancing your natural beauty or creating a beautiful new look, it should always still feel like you.",
  "specialises": [
   "Airtouch Balayage",
   "Colour Blending",
   "Colour Correction"
  ],
  "bestFor": "Healthy hair and a look that enhances your natural beauty",
  "vibe": [
   "Welcoming",
   "Relaxing",
   "Friendly"
  ],
  "loveMeIf": "you want a look that enhances your natural beauty and reflects your personality.",
  "mattersMost": "that you feel genuinely cared for, confident and self-assured, start to finish.",
  "inMyChair": "expect a proper consultation built around your hair goals, lifestyle and features.",
  "review": "Chalani is such an angel! Learned so much from her during my time of getting my hair done. Very helpful and tried her best to accommodate to me during my time of sitting for 6-7 hours (trust me, it ain't easy lol). I highly recommend her service, she truly knows what's best for your hair. Would absolutely choose to have my hair done by her again.",
  "reviewBy": "Melina",
  "works": 6
 },
 "MAY": {
  "role": "Junior Stylist",
  "quote": "Whether it's a fresh new look or damaged hair brought back to life, you're in safe, careful hands.",
  "bio": "From the Philippines, with over fourteen years as a professional hairstylist here in the UAE and the last five at Tara Rose. I'm friendly, patient and detailoriented, and clients often say I listen carefully and make them feel completely at ease. I love creating a customised look that suits your face shape and style.",
  "specialises": [
   "Straightening",
   "Deep-conditioning Treatments",
   "Balayage & Fashion Color"
  ],
  "bestFor": "A fresh new look or restoring damaged hair",
  "vibe": [
   "Relaxing",
   "Welcoming",
   "Safe in your hands"
  ],
  "loveMeIf": "you want a fresh new look, or healthy hair brought back from damage.",
  "mattersMost": "that you feel comfortable, confident and excited to trust me with your hair.",
  "inMyChair": "relax completely. I'll listen carefully and put you at ease.",
  "review": "I had an amazing experience with May! I went in for a full balayage and the results are absolutely perfect exactly what I was looking for. Not only is she incredibly talented, but she is also so kind and made the whole appointment such a pleasure. I highly recommend her if you're looking for a flawless color and a great experience!",
  "reviewBy": "An",
  "works": 6
 },
 "IRLYN": {
  "role": "Junior Stylist",
  "quote": "Your goals come first, and we'll get there with a proper plan, not a guess.",
  "bio": "I'm Filipino, friendly, patient and hardworking, and I love connecting with people and making them feel comfortable. With five years in hairdressing, I take the time to understand exactly what you're looking for before I make any recommendations. Clients describe me as approachable, attentive and someone who genuinely listens.",
  "specialises": [
   "Hair Colour",
   "Keratin & Smoothing",
   "Extensions"
  ],
  "bestFor": "First-timers who want to feel at ease",
  "vibe": [
   "Comfortable",
   "Friendly",
   "Trustworthy"
  ],
  "loveMeIf": "you're new to the salon and want a stylist who listens before she recommends.",
  "mattersMost": "that your needs and goals are the priority, every visit.",
  "inMyChair": "expect a thorough consultation and a calm, friendly experience you can trust.",
  "review": "I had such a great experience at Tara Rose Salon! It was my first time ever dyeing my hair, and I was honestly a bit nervous, but Lynn was amazing. She made me feel comfortable, explained everything, and did such a beautiful job. I absolutely love how my hair turned out. I've gotten so many compliments, and people keep asking me where I did it! Highly recommend this salon, especially Lynn. I'll definitely be coming back again!",
  "reviewBy": "Asma",
  "works": 6
 },
 "EMMA": {
  "role": "Style Director",
  "quote": "Healthy hair is beautiful hair. My goal is to create colour you'll love today and still love weeks later.",
  "bio": "Healthy hair is beautiful hair. My goal is to create colour you'll love today and still love weeks later.",
  "specialises": [
   "All Hair Colour",
   "Precision Haircuts",
   "Healthy Hair Transformations",
   "Bespoke Treatments"
  ],
  "bestFor": "Personalised advice on hair condition Treatment plans & home care recommendations Long-lasting, healthy colour results",
  "vibe": [
   "Friendly",
   "Informative",
   "Empathetic",
   "Lively"
  ],
  "loveMeIf": "You want beautiful, healthy hair with colour that lasts, plus expert advice on how to keep it looking its best between appointments.",
  "mattersMost": "Creating happy clients through honest advice, teamwork, great conversations, and lasting relationships.",
  "inMyChair": "Relax, be yourself, and trust that you'll always receive honest recommendations that are right for your hair.",
  "review": "Emma has done my hair for the last 2 years and I'm so loyal. She really gets what I'm trying to do with my hair and is so good at getting the exact colour I want every time. The Saadiyat branch is gorgeous, chic and comfortable, and everyone there is so friendly. They know me so well that all my preferences are noted down, so it's a relaxing experience every visit. Well worth it!",
  "reviewBy": "Lily",
  "works": 6
 },
 "JEIDA": {
  "role": "Style Director",
  "quote": "Give me a little creative freedom, and I'll give you colour you can completely trust.",
  "bio": "British, originally from Azerbaijan, with twenty-three years behind the chair, twelve in London and eleven here in Abu Dhabi. I'm calm, balanced and a genuinely good listener. I specialise in balayage, creative colour and cutting for long and short hair, and I do my best work when a client trusts me to be creative with their look.",
  "specialises": [
   "Balayage & blonde",
   "Creative colour",
   "Haircut specialist"
  ],
  "bestFor": "Clients who want to hand over the reins and be surprised",
  "vibe": [
   "Calm",
   "Considered",
   "Easy to talk to"
  ],
  "loveMeIf": "you want to give a colourist creative freedom and trust the result.",
  "mattersMost": "that you feel real trust and confidence in what I'm offering you.",
  "inMyChair": "relax with a calm, balanced stylist who listens before she creates.",
  "review": "So happy with my experience with Jeida . I met Jeida a couple of years ago in Abu Dhabi.I left the city and I am so happy to have returned and found her at Tara Rose. Fantastic with coloring blonde hair. You can trust her 100% with your cut, color, and hair care advice. Thank you Jeida!",
  "reviewBy": "Lily",
  "works": 6
 },
 "HOLLY": {
  "role": "Senior Stylist",
  "quote": "Sun-kissed, lived-in colour that grows out as beautifully as the day you leave.",
  "bio": "I'm happiest by the water, and that's where my style comes from: soft, beachy colour that looks like you, only brighter. Sit in my chair and you can switch off completely. I listen first, then we build something that fits your real life.",
  "specialises": [
   "Blondes",
   "Highlights",
   "Lived-in Colour"
  ],
  "bestFor": "Low-maintenance colour, high impact",
  "vibe": [
   "Warm",
   "Relaxed",
   "Easy company"
  ],
  "loveMeIf": "you want hair that looks natural, never \"done,\" and easy to live with between visits.",
  "mattersMost": "that you feel comfortable and heard before we touch a single strand.",
  "inMyChair": "chat the whole way through or sink into the quiet. Both are welcome here.",
  "review": "I had such a great haircut experience with Holly. Hands down the BEST hairdresser I have ever met! She transformed my hair into exactly what I imagined it to look like. I absolutely loved her work, she's very talented. The salon and all the staff were very friendly and welcoming I loved the vibes and I'm definitely going there again.",
  "reviewBy": "Shai",
  "works": 6
 },
 "MOLLY": {
  "role": "Senior Stylist",
  "quote": "Beautiful colour is easy. Beautiful colour that keeps your hair healthy is the real skill.",
  "bio": "Originally from the UK, with sixteen years in the hair industry and thirteen of those on the salon floor. I'm friendly, knowledgeable, approachable and genuinely passionate about what I do. I specialise in scalp bleaches, colour and healthy blondes, and your hair's health always comes first with me.",
  "specialises": [
   "Scalp bleaches",
   "Colour changes",
   "Blondes & Balayages"
  ],
  "bestFor": "Beautiful, healthy colour tailored to you",
  "vibe": [
   "Relaxed",
   "Friendly",
   "Personal"
  ],
  "loveMeIf": "you want beautiful colour without ever compromising on hair health.",
  "mattersMost": "that you feel confident, comfortable and completely looked after.",
  "inMyChair": "relax into a friendly, personal appointment built entirely around you.",
  "review": "Molly was my hairdresser and she completely understood what I wanted from the moment we started speaking. She gave me lots of advise and made my vision come to life. My hair colour was natural before and Molly gave me a beautiful balyage, cut, blow dry and curled it at the end. Curls never last in my hair but this one lasted all day.",
  "reviewBy": "Niamh",
  "works": 6
 },
 "TAMMY": {
  "role": "Stylist",
  "quote": "Beautiful, wearable colour, backed by the science to keep your hair healthy.",
  "bio": "I'm fun, energetic and a little obsessed with the science behind colour. I'm always learning so I can give you the best result while keeping your hair healthy. Expect a relaxed chair, great conversation and honest advice.",
  "specialises": [
   "Blondes",
   "Grey Blending",
   "All-Over Colour",
   "Hair Transformations"
  ],
  "bestFor": "In-depth consultations The science behind healthy hair Hair condition advice",
  "vibe": [
   "Honest",
   "Informative",
   "Lively",
   "Energetic"
  ],
  "loveMeIf": "You want a stylist who'll guide you through every step with the knowledge and expertise to help you achieve your dream hair.",
  "mattersMost": "Client satisfaction without ever compromising the health of your hair.",
  "inMyChair": "Receive professional advice, enjoy plenty of laughs, and leave with results you'll love.",
  "review": "Tara Rose has been my go-to for years. I've had the pleasure to have Tammy do an Ash Beige balayage for my hair which I fully trusted her to do based on her recommendation. She knows what's up. Her expertise, knowledge and style really made all the difference! Especially having her walk me through the entire experience.",
  "reviewBy": "Tanya",
  "works": 6
 },
 "BETHANY": {
  "role": "Stylist",
  "quote": "Fourteen years of getting people to look in the mirror and finally exhale.",
  "bio": "With fourteen years in the industry, I create beautiful, confidenceboosting results tailored to you, whether that's the perfect blonde, a full change or a precision cut. I take time to understand your lifestyle and goals, so the look actually works for you.",
  "specialises": [
   "Blondes",
   "Makeovers",
   "Precision Cuts"
  ],
  "bestFor": "A considered change, done properly",
  "vibe": [
   "Warm",
   "Professional",
   "Genuinely caring"
  ],
  "loveMeIf": "you want real expertise and a stylist who listens before she lifts the scissors.",
  "mattersMost": "that you leave feeling confident and happy, not just with a good hair day.",
  "inMyChair": "expect a warm, personalised experience from the moment you sit down.",
  "review": "Had a wonderful experience today with Beth at Tara Rose! I came in ready for a change and Beth was so great at thoroughly talking with me about what I want and what would look best - it made me feel so comfortable and confident. I absolutely love how my hair looks and am so pleased with the results! If you are ready to step up your hair game - Beth is your girl!",
  "reviewBy": "Rebecca",
  "works": 6
 },
 "SHELLEY": {
  "role": "Stylist",
  "quote": "Twenty years a colour specialist, including the corrections nobody else will touch.",
  "bio": "From Scotland, I'm cheerful, easy to chat with, and love spending time outdoors. I enjoy creating natural-looking colour, especially rich brunettes and soft balayages, helping clients achieve beautiful, healthy-looking hair that suits their lifestyle.",
  "specialises": [
   "All-Over Colour",
   "Brunette Colour"
  ],
  "bestFor": "Natural-looking colour",
  "vibe": [
   "interactive",
   "Cheerful",
   "Relaxed",
   "Great Conversations"
  ],
  "loveMeIf": "You're looking for natural, healthy-looking hair with colour that enhances your own style.",
  "mattersMost": "Making sure every client leaves happy while never compromising the health of their hair.",
  "inMyChair": "Relax, have a great chat, enjoy a few laughs, and leave feeling happy and confident.",
  "review": "Wonderful experience. From the greeting at the door, to the one on one consultation with Shelley. She took the time to discuss about my hair needs and what my ultimate goal was for my hair. And took the time to listen and came up with a haircut that would suit me and meet what I wished for. I'm so beyond happy with my hair. I keep getting so many compliments because it truly suits me.",
  "reviewBy": "Candiy",
  "works": 6
 },
 "APRIL": {
  "role": "Stylist",
  "quote": "Low-maintenance hair, high-impact results, and your hair's health first, every time.",
  "bio": "I love creating beautiful hair through extensions, colour, highlights, and styling. Great hair builds great confidence, and I'm passionate about helping you achieve a look you'll love while always giving honest recommendations, never pressure.",
  "specialises": [
   "Hair Extensions",
   "All-Over Colour",
   "Hair Smoothing Treatments",
   "Hair Styling"
  ],
  "bestFor": "Hair extension recommendations and transformations",
  "vibe": [
   "Friendly",
   "Hospitable",
   "Accommodating",
   "Informative"
  ],
  "loveMeIf": "You want refined results that look great long after you leave the salon.",
  "mattersMost": "Giving honest advice with no pressure and helping you achieve beautiful hair without sacrificing your budget.",
  "inMyChair": "Expect technical precision and a calm, friendly few hours.",
  "review": "I just wanted to say a huge thank you to April. Shes such an amazing hairstylist and so professional. She was so patient and listened to all my concerns. I was so happy that even when I wanted her to check my hair she called me in and was so helpful. She gives the best headmassges. Can't wait to book in with her again. Thanks April, youre a gem.",
  "reviewBy": "Saiqa",
  "works": 6
 },
 "EDS": {
  "role": "Junior Stylist",
  "quote": "Leave feeling beautiful, inside and out, with a finish that actually lasts.",
  "bio": "From the beautiful country of the Philippines. I love creating beautiful balayages, smooth, glossy hair, and polished styling that helps you look and feel your best. Whether you're after a fresh new look or healthier, more manageable hair, I'm here to make every visit relaxing and enjoyable.",
  "specialises": [
   "Keratin & Hair Smoothing",
   "Treatments",
   "Bespoke Hair Treatments",
   "Blow-dries & Styling"
  ],
  "bestFor": "A beautiful, polished finish",
  "vibe": [
   "Warm",
   "Cheerful",
   "Loving",
   "Chill"
  ],
  "loveMeIf": "You want to feel beautiful inside and out, not just for the photo.",
  "mattersMost": "Creating satisfied clients by giving my very best at every visit and making sure you leave happy with the results.",
  "inMyChair": "Enjoy your salon experience, achieve the style you want, and leave feeling like the best version of yourself.",
  "review": "You know that feeling of knowing without a doubt that you have finally found what you were looking for? That is how I felt today during my appointment with Edz. Atfer months of looking for a professional, knowledgeable, friendly and gentle stylist in Abu Dhabi, I can say I found her. And boy, oh boy, am I delighted and relieved. I am going to recommend her to anyone and everyone. You might want to check her insta @edzasuncion to get an idea of her work. Know that on top of her hair coloring mastery she is a sweet and kind gentle person. Plus she gives terrific hair washing massages.",
  "reviewBy": "Marta",
  "works": 6
 },
 "ASHLEIGH": {
  "role": "Style Director",
  "quote": "Everyone who sits in my chair leaves happy. That's the whole job.",
  "bio": "From Edinburgh, Scotland, with eighteen years behind the chair, fifteen back home and three here in Dubai. I'm bubbly, honest, easy to talk to and can be a bit silly, but always a shoulder to lean on if you need one. Blondes and extensions are my thing, and I want every client to leave feeling welcome, comfortable and confident.",
  "specialises": [
   "Blondes",
   "Extensions"
  ],
  "bestFor": "Anyone who wants to leave happy and feel like themselves",
  "vibe": [
   "Chilled",
   "Chatty",
   "Will follow your mood"
  ],
  "loveMeIf": "you want honest advice and a stylist who's genuinely easy to be around.",
  "mattersMost": "that everyone who sits in my chair leaves happy.",
  "inMyChair": "be as chatty or as chilled as you like. I'll follow your vibe on the day.",
  "review": "I've lived in Dubai for over a year and a half and I'm loyal almost to a fault, so instead of finding a new stylist I'd fly back to South Africa to see mine (not smart when you're a high maintenance blonde). When I realised my hair was suffering, I reached out to Ashleigh on Instagram. A month later I've seen Ash twice and we've mapped out the next 6 months: treatments, colour, trims, you name it. This woman is a magician, I'd give her more stars if I could, and now she's stuck with me forever.",
  "reviewBy": "Talia",
  "works": 6
 },
 "ALAN": {
  "role": "Style Director",
  "quote": "Luxury colour and precision cuts, tailored entirely to you.",
  "bio": "Hair isn't just my profession, it's what I love. I specialise in beautiful blondes, lived-in colour and precision cuts, all designed around you. My goal is for you to feel confident, comfortable and completely in love with your hair.",
  "specialises": [
   "Luxury Blonde Transformations",
   "Lived-In Colour & Balayage",
   "Precision Cutting",
   "Grey Blending",
   "Beautiful, Healthy Hair"
  ],
  "bestFor": "Clients wanting a personalised hair plan; Low-maintenance luxury colour Hair that grows out beautifully First-time colour clients; Natural-looking transformations",
  "vibe": [
   "Warm",
   "Personal",
   "Tailored",
   "Premium",
   "Confidence Boosting"
  ],
  "loveMeIf": "You want a stylist who listens first and colours second.",
  "mattersMost": "Creating hair you'll still love weeks after you leave the salon.",
  "inMyChair": "Feel listened to, looked after and completely confident in every decision.",
  "review": "Alan is truly amazing at what he does! He understands exactly what I want every time and makes my hair look fresh, healthy, and beautifully styled. He's professional, talented, and always a pleasure to visit. Highly recommend him to anyone looking for great results and great energy.",
  "reviewBy": "BeautybarbySaba",
  "works": 6
 },
 "LUCY": {
  "role": "Style Director",
  "quote": "The bob, done properly, and natural colour that looks quietly expensive.",
  "bio": "My passion is the bob, the most elegant cut in all its versions, paired with soft micro-highlights for a natural look. I love volume and a bouncy blow-dry. I work beautifully with soft, elegant looks and with fantasy colour.",
  "specialises": [
   "Bob Cuts",
   "Soft Micro-Highlights",
   "Brunette Hair Colours",
   "Grey Transition"
  ],
  "bestFor": "Elegant Cuts Playful Colour Natural lookings",
  "vibe": [
   "Stylish",
   "Precise",
   "Expressive"
  ],
  "loveMeIf": "you want a sharp, elegant cut or a colour that's a little more playful.",
  "mattersMost": "a soft, natural, elegant finish that genuinely suits you.",
  "inMyChair": "go beautifully classic or have some fun with colour.",
  "review": "I visited Lucy for a hydration treatment, color, and cut. The change was spectacular! I went in with lifeless hair and left with a gorgeous mane. Now I'll take care of it exactly as she recommended.",
  "reviewBy": "Hannah",
  "works": 6
 },
 "ROBYN": {
  "role": "Senior Stylist",
  "quote": "Luxury colour and extensions, tailored to you. Beautiful, healthy hair you'll love every day.",
  "bio": "Luxury colour and extensions, tailored to you. Beautiful, healthy hair you'll love every day.",
  "specialises": [
   "Extensions",
   "Blondes",
   "Lived-In Colour"
  ],
  "bestFor": "Effortless length & colour",
  "vibe": [
   "Relaxed",
   "Warm",
   "Easy"
  ],
  "loveMeIf": "you want effortless, beautiful hair that's tailored to you.",
  "mattersMost": "that you feel your absolute best when you leave.",
  "inMyChair": "switch off and enjoy some time that's just for you.",
  "review": "I'm super fussy about who does my extensions and rarely love the outcome, but Robyn is an absolute superstar. After months of searching, I was recommended to her and she listened to exactly what I wanted: length, application type, and a placement tailored to my natural growth patterns and the cut I had in mind. She delivered. The colour match was spot on and I've had so many compliments on how natural it looks. My Dubai hair fairy!",
  "reviewBy": "Imogen",
  "works": 6
 },
 "ELISE": {
  "role": "Senior Stylist",
  "quote": "Calm, patient and genuinely listening, with thirteen years behind the chair.",
  "bio": "I'm from Wales with thirteen years in the industry, specialising in all aspects of cutting and colouring. I love soft, lived-in, lowmaintenance colour. Clients describe me as calm, patient and gentle, and I really listen to get it right.",
  "specialises": [
   "Cutting",
   "Lived-In Colour"
  ],
  "bestFor": "A calm appointment and easy-care colour",
  "vibe": [
   "Calm",
   "Gentle",
   "Patient"
  ],
  "loveMeIf": "you want a gentle, unhurried appointment with someone who truly listens.",
  "mattersMost": "your hair's health, first and always.",
  "inMyChair": "have a good chat or enjoy the quiet, whichever you prefer.",
  "review": "I had my hair coloured and styled by Elise and I was absolutely thrilled with the results. She was so friendly and welcoming, really listened to what I wanted, and took the time to help me understand what different options would look like for me. Elise was attentive throughout the appointment, offering great advice while making me feel comfortable and relaxed. I left with beautiful vibrant hair and a big smile on my face. I highly recommend Elise, a true gem in Dubai! :)",
  "reviewBy": "Hannah",
  "works": 6
 },
 "RUTH": {
  "role": "Style Director",
  "quote": "Luxury Colour designed around you.",
  "bio": "I believe exceptional hair should never feel high maintenance. Every colour is tailored to enhance your features, suit your lifestyle and protect your hair's integrity. From refined blondes to bespoke transformations, I create timeless, effortless results that last. As an award-winning colourist and Schwarzkopf Professional Artistic Team member, I combine international expertise with meticulous attention to detail for a truly personalized experience.",
  "specialises": [
   "Bespoke Blonding",
   "Luxury Colour",
   "Transformation Advanced Colour Corrections"
  ],
  "bestFor": "Effortless luxury blondes, bespoke colour designs and transformative colour corrections",
  "vibe": [
   "Expert",
   "Creative",
   "Trusted"
  ],
  "loveMeIf": "You value healthy hair, appreciate honest expertise and believe luxury is found in the details.",
  "mattersMost": "That you feel beautiful and confident everyday.",
  "inMyChair": "Do whatever you want! It's your time.",
  "review": "Ruth is the best in DXB for highlights! Since I started seeing her, my hair has been stronger, healthier, and looks totally natural. There's nothing I dislike more than a visible line where highlights start, but even after 2 months of growth that dreaded line is hard to spot. The way Ruth does highlights means I can go 2 months between appointments, so less damage to my hair (and my bank balance). If you want a sincere, relatable hairdresser, Ruth is the one!",
  "reviewBy": "Eloise",
  "works": 6
 },
 "IBRAHIM": {
  "role": "Senior Stylist",
  "quote": "Leave feeling like the most confident version of yourself, and knowing exactly how we got there.",
  "bio": "With over 10 years of professional salon experience, including 7 years in the UAE. As one of the Senior Stylists, I specializes in dimensional blondes, balayage, and precision restyles. One of the Schwarzkopf Professional Team Member, I am passionate about creating beautiful, personalized colour while helping clients understand the process every step of the way.",
  "specialises": [
   "Dimensional Blondes",
   "Balayage",
   "Restyle Cuts"
  ],
  "bestFor": "Clients looking for a confidence-boosting transformation with expert colour guidance.",
  "vibe": [
   "Educational",
   "Honest",
   "Friendly"
  ],
  "loveMeIf": "You're ready for a real change and want a colour specialist who explains every step, so you always feel informed and confident.",
  "mattersMost": "That you feel welcomed, comfortable, and completely confident in both the process and the final result.",
  "inMyChair": "Ask as many questions as you like. I'll guide you through the how, the why, and the best approach for your hair, every step of the way.",
  "review": "Ibrahim is a magician! I went to him for correction of a bad color job at a different salon. He patiently explained how he can fix it, made it sound super easy (this was my second attempt at correction), and only suggested the minimal required processes. I was absolutely delighted with the results, and was even more pleasantly surprised by the cost. He really only did what was necessary without trying to rack up the cost. My hair now looks healthy and natural, which is what I always wanted. Thank you Ibrahim! Looking forward to more!",
  "reviewBy": "Swaathikka",
  "works": 6
 },
 "AREANNE": {
  "role": "Junior Stylist",
  "quote": "Healthy, beautiful hair and a couple of hours that feel genuinely calm.",
  "bio": "With seven years of hands-on salon experience, I'm passionate about creating healthy, beautiful hair and making sure every client feels comfortable, heard and confident in my chair. Im dedicated to continuous learning and take pride in delivering results tailored to your hair goals and lifestyle.",
  "specialises": [
   "Smoothing Treatments",
   "Hair/Scalp Treatments",
   "Blowdries"
  ],
  "bestFor": "Healthy, beautiful hair and a relaxing salon experience and also loves hair extensions",
  "vibe": [
   "Friendly",
   "Relaxing",
   "Positive"
  ],
  "loveMeIf": "You want healthier, smoother hair and a stylist who gives you her full attention.",
  "mattersMost": "That you feel comfortable, welcome and well looked after, from start to finish.",
  "inMyChair": "Switch off, relax and leave feeling confident and cared for.",
  "review": "I visited Tara Rose Al Quoz for the first time and had the most pleasant experience. Areanne was so kind and attentive and really took the time to find out my hair concerns and gave a great recommendation for my hair type. I had the Keratin blow dry and I am really happy with the results. Areanne even invited me back for a hair wash and blow dry to wash out the treatment. Such a wonderful experience thanks to Areanne. Will be back again!",
  "reviewBy": "Elizabeth",
  "works": 4
 }
};
