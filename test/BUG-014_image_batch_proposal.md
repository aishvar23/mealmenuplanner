# BUG-014 Phase 6 — Image content batch (proposal for licensing review)

> **Status: awaiting your approval.** Nothing here has been downloaded, committed,
> or applied to the catalog yet. These are candidate **openly-licensed** images
> from Wikimedia Commons for the must-have dishes/ingredients
> (`test/14_end_to_end_acceptance_tests.md` → "Required seeded dish data").
> Please review the licenses/attribution, then I'll proceed.

## Plan once approved (decisions already made: static hosting + free-licensed batch)

1. Download each approved file into `public/images/dishes/<slug>.jpg` /
   `public/images/ingredients/<slug>.jpg` (static hosting — referenced as
   `/images/dishes/<slug>.jpg`, no `next.config` change).
2. Add a `public/images/CREDITS.md` recording author + license + source URL for
   every CC BY / CC BY-SA image (attribution is **required** by those licenses).
3. Extend the seed generator (Phase 6a) to emit `image_url`, `image_alt_text`,
   `image_status`, `image_verified`; set the approved rows to
   `status = 'verified'`, `image_verified = true` with the alt text below; leave
   everything else `placeholder`.
4. Regenerate `supabase/seed.sql`, apply to cloud dev, and re-run the IMAGE-001/
   002/003/005 visual checks against real photos.

## Licensing notes to confirm

- All candidates were read from live Commons file metadata (not guessed).
- **CC BY / CC BY-SA require visible attribution**; **CC BY-SA also requires
  share-alike** on any modified/derived versions. CC0 / public domain have no
  attribution requirement.
- Two items flagged for your attention:
  - **Tomato** (`Tomato_je.jpg`) — clean CC BY-SA 3.0 photo of a single tomato,
    but its Commons description field contains unrelated junk text; the image
    itself is correct.
  - **Chicken Curry** — clearly chicken curry, but the plate also has rice and
    vegetables on the side.

File-page names below are wrapped in backticks so the underscores stay literal;
the full URL is `https://commons.wikimedia.org/wiki/<file page>`.

## Candidate images

### Main / meal components

| Dish            | License      | Author (attribution) | Commons file page                                     | Suggested alt text                                                 |
| --------------- | ------------ | -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Masala Dosa     | CC BY-SA 4.0 | Sumitbanti           | `File:Masala_Dosa_(Bengaluru).JPG`                    | A crisp golden South Indian masala dosa filled with spiced potato. |
| Rajma           | CC BY-SA 2.0 | Gaurav Nemade        | `File:Rajma_Masala_(32081557778).jpg`                 | Red kidney beans simmered in a thick spiced onion-tomato gravy.    |
| Chole           | CC BY-SA 2.0 | Simon Law (sfllaw)   | `File:Chana_masala.jpg`                               | Chickpeas cooked in a spiced tomato-onion masala (chole).          |
| Dal Tadka       | CC BY 3.0    | Biswarup Ganguly     | `File:Punjabi_Dal_Tadka_-_Mohali_2016-08-07_8549.JPG` | A bowl of yellow lentils tempered with cumin and spices.           |
| Paneer Bhurji   | CC BY-SA 4.0 | Maskaravivek         | `File:Homemade_Paneer_Bhurji.jpg`                     | Scrambled paneer cooked with onions, tomatoes and spices.          |
| Paratha         | CC BY-SA 4.0 | Arvind2222           | `File:Aaloo_plain_paratha.jpg`                        | A pan-cooked Indian wheat paratha flatbread.                       |
| Roti            | CC BY-SA 4.0 | Euniceyeoh07         | `File:Chapati_roti.jpg`                               | A soft round Indian wheat chapati (roti) flatbread.                |
| Jeera Rice      | CC BY-SA 4.0 | JVRKPRASAD           | `File:Jeera_Rice_(only).jpg`                          | Steamed white rice flavoured with cumin seeds.                     |
| Vegetable Pulao | CC BY-SA 4.0 | Seena.ge             | `File:Vegetable_pulav.JPG`                            | Spiced rice cooked with mixed vegetables.                          |
| Khichdi         | CC BY-SA 4.0 | Dolon Prova          | `File:Vegetable_Khichdi.jpg`                          | A soft one-pot dish of rice and lentils with vegetables.           |
| Egg Curry       | CC BY 2.0    | Andrea Nguyen        | `File:Egg_curry.jpg`                                  | Boiled eggs simmered in a spiced North Indian curry gravy.         |
| Chicken Curry   | CC BY 4.0    | Bluemantis07         | `File:South_Indian_Chicken_curry.jpg`                 | Indian chicken curry in a spiced gravy.                            |

### Side dishes / condiments

| Dish            | License       | Author (attribution) | Commons file page                              | Suggested alt text                                     |
| --------------- | ------------- | -------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Coconut Chutney | CC BY-SA 2.0  | Charles Haynes       | `File:Coconut_Chutney.jpg`                     | A bowl of white South Indian coconut chutney.          |
| Mint Chutney    | CC BY-SA 4.0  | Jaya.bhardwaj63      | `File:Mint_Chutney.JPG`                        | A bowl of green mint-coriander chutney.                |
| Mango Pickle    | CC BY-SA 4.0  | Shashank7200         | `File:Mango_Hing_Achaar_01.JPG`                | Indian mango pickle (aam ka achaar) in oil and spices. |
| Papad           | CC BY-SA 4.0  | Dr. Manavpreet Kaur  | `File:Roasted_Papad.JPG`                       | A thin crisp roasted Indian papad.                     |
| Raita           | Public domain | Anette B.            | `File:Raita.jpg`                               | A bowl of Indian yogurt raita.                         |
| Green Salad     | CC BY-SA 4.0  | Talupu               | `File:Mixed_salad_(Kosambri_or_Kachumber).jpg` | A fresh diced salad of cucumber, tomato and onion.     |
| Jeera Aloo      | CC BY-SA 4.0  | Gaurav Dhwaj Khadka  | `File:Jeera_aloo.jpg`                          | Diced potatoes sautéed with cumin seeds.               |

### Ingredients

| Ingredient      | License      | Author (attribution) | Commons file page                                     | Suggested alt text                           |
| --------------- | ------------ | -------------------- | ----------------------------------------------------- | -------------------------------------------- |
| Tomato          | CC BY-SA 3.0 | Softeis              | `File:Tomato_je.jpg`                                  | A single whole ripe red tomato.              |
| Rice (uncooked) | CC BY 2.0    | cookbookman17        | `File:Basmati_Rice_India,_raw.jpg`                    | Uncooked long-grain white basmati rice.      |
| Paneer          | CC BY 2.0    | Ian Brown            | `File:Homemade_Paneer_Block_Fromage_Cheese_India.jpg` | A block of fresh white Indian paneer cheese. |
| Onion           | CC BY-SA 4.0 | Rahimatu03           | `File:Bulb_Onion.jpg`                                 | A whole onion bulb.                          |

> Several required acceptance dishes (Rajma, Chole, Dal Tadka, …) and ingredients
> are **not yet in the seed catalog** — adding those dish rows is separate catalog
> work; this batch covers images for the dishes that exist plus the must-have set.
