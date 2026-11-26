# Artwork outside the drawing set

## The feast painting on "Your events" (`art/feast.webp`)

Shown above the greeting on the signed-in home, framed with a gold hairline. The page hides the frame until the file
loads, so the home works without it.

**Gemini prompt**

> A wide painting in the naive style of the Georgian painter Niko Pirosmani: a Georgian wedding feast (supra) at night.
> Flat, frontal figures painted on black oilcloth, which shows through as the dark background. One long table runs
> across the whole picture, covered with a glowing white tablecloth. Behind it, in one row, sit about twelve guests in
> traditional and simple clothes. In the middle sit the bride, in a white dress and veil, and the groom, in a dark
> chokha. A tamada stands at the left, raising a drinking horn. On the table: clay wine jugs, bread, grapes,
> pomegranates, roast meat, herbs, a few candles. Colours: black ground, white cloth, deep wine red, ochre, earthy bottle
> green, touches of gold. Thin dark outlines and simple shapes, warm and joyful, slightly uneven like a real painting
> on oilcloth. No text, letters, signature or frame. Very wide format, about 3:1, with the couple in the centre third so
> the picture can be cropped on phones.

**Adding it**

1. Save the chosen image as `new-art/feast.png` (not committed).
2. Make the web version (2400 px wide, about 200–350 KB):
   `python3 -c "from PIL import Image; im=Image.open('new-art/feast.png').convert('RGB'); w=2400; im.resize((w, round(im.height*w/im.width)), Image.LANCZOS).save('art/feast.webp', 'WEBP', quality=80)"`
3. Commit `art/feast.webp`. Phones show a 16:9 crop around the centre, desktops 3:1.

Pirosmani (1862–1918) is in the public domain; the prompt asks for a new picture in his manner, not a copy of a painting.
