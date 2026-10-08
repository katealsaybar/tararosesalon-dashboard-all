-- Kate, 8 Oct 2026: first fill of the Client Mix roster, from Phorest's Services export
-- (Manager > Services > Export all services) of Saadiyat, Khalifa City A, Motor City and
-- Al Quoz (they share one menu). Later refreshes come from the Service roster tab.
insert into public.service_families (category, family, updated_by) values
  ('TONING', 'colour', 'seed 8 Oct 2026'),
  ('COLOURING', 'colour', 'seed 8 Oct 2026'),
  ('HIGHLIGHTS', 'colour', 'seed 8 Oct 2026'),
  ('BALAYAGE', 'colour', 'seed 8 Oct 2026'),
  ('BLEACHING', 'colour', 'seed 8 Oct 2026'),
  ('COLOUR LOCKING TRT', 'treat', 'seed 8 Oct 2026'),
  ('REPAIR & HYDRATE TRT', 'treat', 'seed 8 Oct 2026'),
  ('FINE HAIR TRT', 'treat', 'seed 8 Oct 2026'),
  ('CURLY HAIR TRT', 'treat', 'seed 8 Oct 2026'),
  ('BOND REPAIR TRT', 'treat', 'seed 8 Oct 2026'),
  ('BLONDE REVIVAL TRT', 'treat', 'seed 8 Oct 2026'),
  ('MINERAL BUILD-UP TRT', 'treat', 'seed 8 Oct 2026'),
  ('BEAUTY POTION TRT', 'treat', 'seed 8 Oct 2026'),
  ('SCALP TRT', 'treat', 'seed 8 Oct 2026'),
  ('KERATIN', 'treat', 'seed 8 Oct 2026'),
  ('CUTTING', 'cut', 'seed 8 Oct 2026'),
  ('STYLING', 'cut', 'seed 8 Oct 2026'),
  ('1HAIR CUT/STYLING', 'cut', 'seed 8 Oct 2026'),
  ('HANDS AND FEET', 'nails', 'seed 8 Oct 2026'),
  ('HANDS AND FEET - ADD-ON', 'nails', 'seed 8 Oct 2026'),
  ('HANDS AND FEET - Treatment', 'nails', 'seed 8 Oct 2026'),
  ('NAIL EXTENSION', 'nails', 'seed 8 Oct 2026'),
  ('NAIL EXTENSION -ADD ON', 'nails', 'seed 8 Oct 2026'),
  ('THREADING', 'beauty', 'seed 8 Oct 2026'),
  ('WAXING', 'beauty', 'seed 8 Oct 2026'),
  ('FACIALS', 'beauty', 'seed 8 Oct 2026'),
  ('LASH EXTENSION', 'beauty', 'seed 8 Oct 2026'),
  ('LIFTING', 'beauty', 'seed 8 Oct 2026'),
  ('MASSAGE', 'beauty', 'seed 8 Oct 2026'),
  ('TINTING', 'beauty', 'seed 8 Oct 2026'),
  ('RETAIL PRODUCTS', 'retail', 'seed 8 Oct 2026'),
  ('HAIR EXTENSIONS', 'extensions', 'seed 8 Oct 2026'),
  ('Consultation', 'consult', 'seed 8 Oct 2026'),
  ('SKIP', 'skip', 'seed 8 Oct 2026'),
  ('1TREATMENTS - ABC', 'treat', 'seed 8 Oct 2026'),
  ('DUBAI DEALS', 'skip', 'seed 8 Oct 2026'),
  ('PACKAGES', 'skip', 'seed 8 Oct 2026'),
  ('Voucher', 'skip', 'seed 8 Oct 2026'),
  ('Voucher / Package', 'skip', 'seed 8 Oct 2026')
on conflict (category) do nothing;

insert into public.service_catalog (name_key, service_name, category)
select public.stl_name_key(split_part(x, '|', 1)), split_part(x, '|', 1), split_part(x, '|', 2)
from unnest(string_to_array($q$Blast Dry|1HAIR CUT/STYLING
Balayage Refresh - EL/ET|BALAYAGE
Balayage Refresh - F/S|BALAYAGE
Balayage Refresh - L/T|BALAYAGE
Balayage Refresh - MD|BALAYAGE
Balayage Trans. - EL/ET|BALAYAGE
Balayage Trans.-F/S|BALAYAGE
Balayage Trans.-L/T|BALAYAGE
Balayage Trans.-MD|BALAYAGE
Classic Balayage - EL/ET|BALAYAGE
Classic Balayage - F/S|BALAYAGE
Classic Balayage - L/T|BALAYAGE
Classic Balayage - MD|BALAYAGE
Full Balayage - EL/ET|BALAYAGE
Full Balayage-F/S|BALAYAGE
Full Balayage-L/T|BALAYAGE
Full Balayage-MD|BALAYAGE
VEG - Beauty Potion Trt (L/T)|BEAUTY POTION TRT
VEG - Beauty Potion Trt (Med)|BEAUTY POTION TRT
VEG - Beauty Potion Trt (S/F)|BEAUTY POTION TRT
Bleached Roots-EL/ET|BLEACHING
Bleached Roots-F/S|BLEACHING
Bleached Roots-L/T|BLEACHING
Bleached Roots-MD|BLEACHING
Full Head Bleach- EL/ET|BLEACHING
Full Head Bleach- F/S|BLEACHING
Full Head Bleach-L/T|BLEACHING
Full Head Bleach-MD|BLEACHING
Cav - Blonde Rev Trt- F/S|BLONDE REVIVAL TRT
Cav - Blonde Rev Trt- L/T|BLONDE REVIVAL TRT
Cav - Blonde Rev Trt- MD|BLONDE REVIVAL TRT
Olaplex Treatment- L/T|BOND REPAIR TRT
Olaplex Treatment- MD|BOND REPAIR TRT
Olaplex Treatment- S/F|BOND REPAIR TRT
R-2 w/ Color- L/T|BOND REPAIR TRT
R-2 w/ Color- MD|BOND REPAIR TRT
R-two Stand Alone Treatment|BOND REPAIR TRT
Cav - Colour Lock Trt -F/S|COLOUR LOCKING TRT
Cav - Colour Lock Trt- L/T|COLOUR LOCKING TRT
Cav - Colour Lock Trt- MD|COLOUR LOCKING TRT
FC- Colour Lock Trt- L/T|COLOUR LOCKING TRT
FC- Colour Lock Trt- MD|COLOUR LOCKING TRT
FC- Colour Lock Trt- S/F|COLOUR LOCKING TRT
VEG - Colour Lock Trt- L/T|COLOUR LOCKING TRT
VEG - Colour Lock Trt- MD|COLOUR LOCKING TRT
VEG - Colour Lock Trt- S/F|COLOUR LOCKING TRT
Viart- Colour Lock Trt- L/T|COLOUR LOCKING TRT
Viart- Colour Lock Trt- MD|COLOUR LOCKING TRT
Viart- Colour Lock Trt- S/F|COLOUR LOCKING TRT
All Over Color - EL/ET|COLOURING
All Over Color-F/S|COLOURING
All Over Color-L/T|COLOURING
All Over Color-MD|COLOURING
Pre-Pigmentation|COLOURING
Root Colour - EL/ET|COLOURING
Root Colour - F/S|COLOURING
Root Colour - L/T|COLOURING
Root Colour - MD|COLOURING
Root Hairline (15 mins. only)|COLOURING
Root Stretch - EL/ET|COLOURING
Root Stretch - F/S|COLOURING
Root Stretch - L/T|COLOURING
Root Stretch - MD|COLOURING
CAV - Curly Hair Trt- L/T|CURLY HAIR TRT
CAV - Curly Hair Trt- MD|CURLY HAIR TRT
CAV - Curly Hair Trt- S/F|CURLY HAIR TRT
VEG - Curly Hair Trt- L/T|CURLY HAIR TRT
VEG - Curly Hair Trt- MD|CURLY HAIR TRT
VEG - Curly Hair Trt- S/F|CURLY HAIR TRT
30mins. Wash Cut and Finish|CUTTING
45mins Wash Cut and Finish|CUTTING
Cut Only|CUTTING
Cut and Finish 1 HR|CUTTING
Fringe Cut|CUTTING
Restyle Cut and Blowdry|CUTTING
Wash Cut & Finish for Men (1 Hr)|CUTTING
Wash Cut & Finish for Men (30 mins)|CUTTING
Wash Cut & Finish for Men (45 Mins)|CUTTING
8 Step Hair Plan|Consultation
New Client Consultation|Consultation
Talabat .5|DUBAI DEALS
Talabat Full|DUBAI DEALS
Add-On: LED Red Light Therapy|FACIALS
Deep Cleanse & Hydration Facial|FACIALS
Deep Cleanse Facial|FACIALS
Deep Cleanse, Hydration & Lift Facial|FACIALS
Facial Consultation|FACIALS
Signature Relaxing Facial w/ Lifting Massage|FACIALS
Cav - Fine Hair Trt- F/S|FINE HAIR TRT
Cav - Fine Hair Trt- L/T|FINE HAIR TRT
Cav - Fine Hair Trt- MD|FINE HAIR TRT
FC- Fine Hair Trt- L/T|FINE HAIR TRT
FC- Fine Hair Trt- MD|FINE HAIR TRT
FC- Fine Hair Trt- S/F|FINE HAIR TRT
VEG - Fine Hair Trt- L/T|FINE HAIR TRT
VEG - Fine Hair Trt- MD|FINE HAIR TRT
VEG - Fine Hair Trt- S/F|FINE HAIR TRT
Viart- Fine Hair Trt- L/T|FINE HAIR TRT
Viart- Fine Hair Trt- MD|FINE HAIR TRT
Viart- Fine Hair Trt- S/F|FINE HAIR TRT
4 boxes Put in 4|HAIR EXTENSIONS
Bonds Ext. Removal/Refit Per HR|HAIR EXTENSIONS
Change to our rings|HAIR EXTENSIONS
Extension Removal ONLY- Per HR|HAIR EXTENSIONS
Rings Ext. Removal/Refit Per HR|HAIR EXTENSIONS
Tape Ext. Removal/Refit- 1 Pack|HAIR EXTENSIONS
Tape Ext. Removal/Refit- 2 Pack|HAIR EXTENSIONS
Tape Ext. Removal/Refit- 3 Pack|HAIR EXTENSIONS
Tape Ext. Removal/Refit- 4 Pack|HAIR EXTENSIONS
Weft (Push ups) 3 rows|HAIR EXTENSIONS
Weft (push ups ) 2 rows|HAIR EXTENSIONS
Weft Ext. Removal/Refit- 1 Row|HAIR EXTENSIONS
Weft Ext. Removal/Refit- 2 Row|HAIR EXTENSIONS
Weft Ext. Removal/Refit- 3 Row|HAIR EXTENSIONS
Weft ext (push ups) 1 row|HAIR EXTENSIONS
Manicure|HANDS AND FEET
Nail cut & file (Shape only)|HANDS AND FEET
Pedicure|HANDS AND FEET
Shape & Polish H/F|HANDS AND FEET
Biab (Colored)|HANDS AND FEET - ADD-ON
Biab - (Natural)|HANDS AND FEET - ADD-ON
Gel Polish French|HANDS AND FEET - ADD-ON
Gel Polish Plain|HANDS AND FEET - ADD-ON
Gelish (Removal)|HANDS AND FEET - ADD-ON
Glitter Dust (Full set)|HANDS AND FEET - ADD-ON
Nail Art Gel ( Per Nail)|HANDS AND FEET - ADD-ON
Nail Art Gel ( full set)|HANDS AND FEET - ADD-ON
Normal French|HANDS AND FEET - ADD-ON
Normal Polish Full color|HANDS AND FEET - ADD-ON
Ombre Gel polish|HANDS AND FEET - ADD-ON
Sticker Nail Art (per nail)|HANDS AND FEET - ADD-ON
Callus Treatment - 15 mins|HANDS AND FEET - Treatment
Callus Treatment - 30 mins|HANDS AND FEET - Treatment
Paraffin Treatment - Feet|HANDS AND FEET - Treatment
Paraffin Treatment - Hands|HANDS AND FEET - Treatment
Spa (Exfoliate & mask)|HANDS AND FEET - Treatment
3/4 (Roots to Ends)- F/S|HIGHLIGHTS
3/4 (Roots to Ends)-EL/ET|HIGHLIGHTS
3/4 (Roots to Ends)-L/T|HIGHLIGHTS
3/4 (Roots to Ends)-MD|HIGHLIGHTS
3/4 Foils & Full Color-EL/ET|HIGHLIGHTS
3/4 Foils & Full Color-F/S|HIGHLIGHTS
3/4 Foils & Full Color-L/T|HIGHLIGHTS
3/4 Foils & Full Color-MD|HIGHLIGHTS
3/4 Foils & Root Color-EL/ET|HIGHLIGHTS
3/4 Foils & Root Color-F/S|HIGHLIGHTS
3/4 Foils & Root Color-L/T|HIGHLIGHTS
3/4 Foils & Root Color-MD|HIGHLIGHTS
3/4 Foils (Max.Bright) -EL/ET|HIGHLIGHTS
3/4 Foils (Max.Bright) -F/S|HIGHLIGHTS
3/4 Foils (Max.Bright) -L/T|HIGHLIGHTS
3/4 Foils (Max.Bright) -MD|HIGHLIGHTS
3/4 Foils -EL/ET|HIGHLIGHTS
3/4 Foils -F/S|HIGHLIGHTS
3/4 Foils -L/T|HIGHLIGHTS
3/4 Foils -MD|HIGHLIGHTS
FH (Max. Bright) -EL/ET|HIGHLIGHTS
FH (Max. Bright)- F/S|HIGHLIGHTS
FH (Max. Bright)-L/T|HIGHLIGHTS
FH (Max. Bright)-MD|HIGHLIGHTS
FH (Roots to Ends) & Full Colour -EL/ET|HIGHLIGHTS
FH (Roots to Ends) & Full Colour-F/S|HIGHLIGHTS
FH (Roots to Ends) & Full Colour-L/T|HIGHLIGHTS
FH (Roots to Ends) & Full Colour-MD|HIGHLIGHTS
FH (Roots to Ends) & Roots -F/S|HIGHLIGHTS
FH (Roots to Ends) & Roots -MD|HIGHLIGHTS
FH (Roots to Ends) & Roots- EL/ET|HIGHLIGHTS
FH (Roots to Ends) & Roots-L/T|HIGHLIGHTS
FH Foils (Roots to Ends) -EL/ET|HIGHLIGHTS
FH Foils (Roots to Ends)-F/S|HIGHLIGHTS
FH Foils (Roots to Ends)-L/T|HIGHLIGHTS
FH Foils (Roots to Ends)-MD|HIGHLIGHTS
FH w/ Full Colour -EL/ET|HIGHLIGHTS
FH w/ Full Colour -F/S|HIGHLIGHTS
FH w/ Full Colour -L/T|HIGHLIGHTS
FH w/ Full Colour -MD|HIGHLIGHTS
FH w/ Root Color -EL/ET|HIGHLIGHTS
FH w/ Root Color -F/S|HIGHLIGHTS
FH w/ Root Color -L/T|HIGHLIGHTS
FH w/ Root Color -MD|HIGHLIGHTS
Face Frame (Roots to Ends)-EL/ET|HIGHLIGHTS
Face Frame (Roots to Ends)-F/S|HIGHLIGHTS
Face Frame (Roots to Ends)-L/T|HIGHLIGHTS
Face Frame (Roots to Ends)-MD|HIGHLIGHTS
Face Frame (Roots) 30 mins. - F/S|HIGHLIGHTS
Face Frame (Roots) 30 mins.-EL/ET|HIGHLIGHTS
Face Frame (Roots) 30 mins.-MD|HIGHLIGHTS
Face Frame (Roots) 30 mins.L/T|HIGHLIGHTS
Face Frame and Roots - F/S|HIGHLIGHTS
Face Frame and Roots -MD|HIGHLIGHTS
Face Frame and Roots- EL/ET|HIGHLIGHTS
Face Frame and Roots-L/T|HIGHLIGHTS
Full Head Foils -EL/ET|HIGHLIGHTS
Full Head Foils -F/S|HIGHLIGHTS
Full Head Foils -L/T|HIGHLIGHTS
Full Head Foils -MD|HIGHLIGHTS
Half Foils (Max. Bright) - EL/ET|HIGHLIGHTS
Half Foils (Max. Bright) - F/S|HIGHLIGHTS
Half Foils (Max. Bright) -L/T|HIGHLIGHTS
Half Foils (Max. Bright) -MD|HIGHLIGHTS
Half Foils (Roots to Ends) -F/S|HIGHLIGHTS
Half Foils (Roots to Ends) -MD|HIGHLIGHTS
Half Foils (Roots to Ends) L/T|HIGHLIGHTS
Half Foils (Roots to Ends)-EL/ET|HIGHLIGHTS
Half Foils w/ Full Colour -EL/ET|HIGHLIGHTS
Half Foils w/ Full Colour -F/S|HIGHLIGHTS
Half Foils w/ Full Colour -L/T|HIGHLIGHTS
Half Foils w/ Full Colour -MD|HIGHLIGHTS
Half Foils w/ Roots  -F/S|HIGHLIGHTS
Half Foils w/ Roots  -L/T|HIGHLIGHTS
Half Foils w/ Roots  -MD|HIGHLIGHTS
Half Foils w/ Roots -EL/ET|HIGHLIGHTS
Half Head Foils - EL/ET|HIGHLIGHTS
Half Head Foils - L/T|HIGHLIGHTS
Half Head Foils -F/S|HIGHLIGHTS
Half Head Foils -MD|HIGHLIGHTS
Partial (Roots to Ends) - EL/ET|HIGHLIGHTS
Partial (Roots to Ends) -F/S|HIGHLIGHTS
Partial (Roots to Ends) -L/T|HIGHLIGHTS
Partial (Roots to Ends) -MD|HIGHLIGHTS
Partial Foils (Max.Bright) - EL/ET|HIGHLIGHTS
Partial Foils (Max.Bright) -F/S|HIGHLIGHTS
Partial Foils (Max.Bright) -L/T|HIGHLIGHTS
Partial Foils (Max.Bright) -MD|HIGHLIGHTS
Partial Foils - EL/ET|HIGHLIGHTS
Partial Foils -F/S|HIGHLIGHTS
Partial Foils -L/T|HIGHLIGHTS
Partial Foils -MD|HIGHLIGHTS
Partial w/ Full Colour - EL/ET|HIGHLIGHTS
Partial w/ Full Colour -F/S|HIGHLIGHTS
Partial w/ Full Colour -L/T|HIGHLIGHTS
Partial w/ Full Colour -MD|HIGHLIGHTS
Partial w/ Roots - EL/ET|HIGHLIGHTS
Partial w/ Roots -F/S|HIGHLIGHTS
Partial w/ Roots -L/T|HIGHLIGHTS
Partial w/ Roots -MD|HIGHLIGHTS
Frizz Free Extra Long hair - Application|KERATIN
Frizz Free Extra Long hair - Ironing|KERATIN
Frizz-Free Protein Treatment Long - Application|KERATIN
Frizz-Free Protein Treatment Long - Ironing|KERATIN
Frizz-Free Protein Treatment Medium - Application|KERATIN
Frizz-Free Protein Treatment Medium - Ironing|KERATIN
Frizz-Free Protein Treatment Short - Application|KERATIN
Supreme Straighten Extra Long Hair - Application|KERATIN
Supreme Straighten Extra Long Hair - Ironing|KERATIN
Supreme Straighten Long Hair - Application|KERATIN
Supreme Straighten Long Hair - Ironing|KERATIN
Supreme Straighten Medium Hair - Application|KERATIN
Supreme Straighten Medium Hair - Ironing|KERATIN
Supreme Straighten Short Hair - Application|KERATIN
Supreme Straighten Short Hair - Ironing|KERATIN
1wk Lash Extension Refill|LASH EXTENSION
2D/ 3D Extension|LASH EXTENSION
2wks  Lash Extension Refill|LASH EXTENSION
Classic Lash Extension|LASH EXTENSION
Full set - Natural|LASH EXTENSION
Lash Removal|LASH EXTENSION
Russian Full set|LASH EXTENSION
Brow Lamination|LIFTING
LVL|LIFTING
LVL & Brow Lamination Combo|LIFTING
LVL or Brow Lamination|LIFTING
LVL/BROW Lamination (Package)|LIFTING
20 mins. Foot Massage|MASSAGE
20 mins. Neck & Shoulder|MASSAGE
30 mins. Foot Massage|MASSAGE
30 mins. Neck & Shoulder|MASSAGE
Back Massage|MASSAGE
Full Body Massage|MASSAGE
Hand Massage|MASSAGE
Legs and Foot Massage|MASSAGE
Blonde me detox|MINERAL BUILD-UP TRT
Malibu Detox Trt|MINERAL BUILD-UP TRT
Olaplex Chelating Trt|MINERAL BUILD-UP TRT
Nail Extension (Full set)|NAIL EXTENSION
Nail Extension (Refill)|NAIL EXTENSION
Overlay|NAIL EXTENSION
Chrome|NAIL EXTENSION -ADD ON
French Style|NAIL EXTENSION -ADD ON
Length above 3cm|NAIL EXTENSION -ADD ON
Nail Art (Full set)|NAIL EXTENSION -ADD ON
Nail Art (per nail)|NAIL EXTENSION -ADD ON
Nail Extention Removal|NAIL EXTENSION -ADD ON
Nail repair (per nail)|NAIL EXTENSION -ADD ON
Ombre|NAIL EXTENSION -ADD ON
Removal including Manicure|NAIL EXTENSION -ADD ON
NO SHOW|PACKAGES
CAV - Repair or Hydrate Trt- F/S|REPAIR & HYDRATE TRT
CAV - Repair or Hydrate Trt- L/T|REPAIR & HYDRATE TRT
CAV - Repair or Hydrate Trt- MD|REPAIR & HYDRATE TRT
FC- Repair or Hydrate Trt -S/F|REPAIR & HYDRATE TRT
FC- Repair or Hydrate Trt- MD|REPAIR & HYDRATE TRT
FC- Repair or Hydrate Trt-L/T|REPAIR & HYDRATE TRT
VEG - Repair or Hydrate Trt -S/F|REPAIR & HYDRATE TRT
VEG - Repair or Hydrate Trt- MD|REPAIR & HYDRATE TRT
VEG - Repair or Hydrate Trt-L/T|REPAIR & HYDRATE TRT
Viart- Repair or Hydrate Trt -S/F|REPAIR & HYDRATE TRT
Viart- Repair or Hydrate Trt- MD|REPAIR & HYDRATE TRT
Viart- Repair or Hydrate Trt-L/T|REPAIR & HYDRATE TRT
Cav - Scalp Trt|SCALP TRT
VEG - Scalp Trt (JellyMoist)|SCALP TRT
VEG - Scalp Trt (MudDetox)|SCALP TRT
ADD ON: Pin Blowdry|STYLING
EL /ET Blowdry w/ Heat styling|STYLING
Extra Long Blowdry|STYLING
Hair Up|STYLING
Hair wash|STYLING
Long Blowdry|STYLING
Medium hair blowdry|STYLING
Plait|STYLING
Short hair blowdry|STYLING
Chin (Thread)|THREADING
Eyebrow (Thread)|THREADING
Upperlip (Thread)|THREADING
Eyebrow Tint|TINTING
Eyelash & Eyebrow Combo|TINTING
Eyelash Tint|TINTING
Amonia Free Bleach/Color|TONING
Classic Toner -EL/ET|TONING
Classic Toner -F/S|TONING
Classic Toner -L/T|TONING
Classic Toner -MD|TONING
Colour Remover|TONING
Creative Toning -EL/ET|TONING
Creative Toning -F/S|TONING
Creative Toning -L/T|TONING
Creative Toning -MD|TONING
Deluxe Package|Voucher / Package
Pamper Package|Voucher / Package
Service per hour|Voucher / Package
Bikini Line|WAXING
Brazilian|WAXING
Chin|WAXING
Eyebrow|WAXING
Full Arm|WAXING
Full Face|WAXING
Full Leg|WAXING
Full body|WAXING
Half Arm|WAXING
Half Leg|WAXING
Hollywood|WAXING
Underarm|WAXING
Upperlip|WAXING$q$, E'\n')) as x
where x <> ''
on conflict (name_key) do update set service_name = excluded.service_name, category = excluded.category, updated_at = now();
