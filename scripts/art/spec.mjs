// What every picture in the game should show, written as image-model prompts.
//
// The art is generated, not drawn by hand, so this file is the art direction. Each prompt is
// built from the same data the game uses (a dumpling's colour, face, hat and pattern come
// straight from src/data/characters.ts), so the pictures and the game cannot disagree about
// what Taro looks like. Two reference pictures in scripts/art/reference/ hold the style:
// every dumpling is drawn against dumpling.png and every place and prop against scenery.png.
//
// Used by build-jobs.mjs. See scripts/art/README.md for the whole pipeline.

const STYLE_DUMPLING =
  "Character art for a children's collecting game. Draw ONE character in exactly the same style as the reference image: " +
  "the same soft matte foam squishy-toy look, the same gentle 3D shading with one soft white highlight on the upper left, " +
  "the same glossy dark-brown eyes, the same soft round blush, the same proportions and the same size in the frame. " +
  "It belongs to the same toy family as the reference but it is a different character: follow the description below " +
  "for its colours, shape and details, not the reference's. " +
  "Full body, centred, facing the viewer, filling about 80% of the frame, with nothing else in the picture. " +
  "Fully transparent background, no shadow on the ground, no glow, no sparkles, no text.";

const STYLE_THING =
  "Object art for a children's game, in exactly the same soft, cheerful, simple painted style and colours as the reference image. " +
  "Gentle 3D shading, rounded friendly shapes, one soft highlight on the upper left. " +
  "One object only, centred, seen from the front and slightly above, filling about 80% of the frame. " +
  "Fully transparent background, no shadow on the ground, no characters, no faces on the object, no text.";

const STYLE_PLACE =
  "Background scene for a children's game, in exactly the same soft, cheerful, simple painted style, colours and lighting as the reference image, " +
  "but with no characters in it. Seen straight on like a stage set. " +
  "The top 43% of the picture is the back wall or backdrop; the bottom 57% is a flat, open floor seen from slightly above, " +
  "completely empty so small characters and objects can be placed on it. " +
  "Nothing standing on the floor, no furniture, no people, no animals, no text. Flat even lighting, gentle gradients, no strong shadows.";

const SHAPES = {
  round: "Body shape: a classic round bao bun, about as wide as it is tall.",
  tall: "Body shape: taller than it is wide, an upright rounded egg-like bun.",
  wide: "Body shape: short and wide, squat, clearly wider than it is tall.",
  bun: "Body shape: a plump domed bun with a flat bottom and a gently rounded top.",
};

const FACES = {
  smile: "Face: two round glossy dark-brown dot eyes set wide apart, and a small simple curved smile.",
  happy: "Face: eyes squeezed shut into two happy upward curves, and a wide open happy smile with a little pink tongue.",
  sleepy: "Face: eyes peacefully closed as two short flat lines, and a tiny round open mouth, as if dozing.",
  wow: "Face: big round glossy dark-brown eyes each with a small white shine, and a small round open 'o' mouth, looking surprised.",
  cat: "Face: eyes squeezed into happy upward curves, a little cat mouth shaped like a small 'w', and two thin whisker lines on each cheek.",
  wink: "Face: one round glossy dark-brown eye open and the other closed in a playful wink, and a small lopsided smile.",
  fangs: "Face: round glossy dark-brown dot eyes and a wide friendly grin with two tiny white pointed fang teeth. Cute, not scary.",
};

const HATS = {
  none: "",
  bow: "It wears a small pink-red ribbon bow (#ff6b8a) at a jaunty angle on the top right of its head.",
  sprout: "A tiny green two-leaf seedling sprouts from its top.",
  crown: "It wears a small golden crown with three points, a pink gem on the outer points and a blue gem in the middle.",
  beanie: "It wears a soft orange knitted beanie (#ff8f5e) with a white pom-pom, pulled snugly over the top of its head.",
  glasses: "It wears a pair of round dark-rimmed glasses over its eyes.",
  halo: "A thin glowing golden halo floats just above its top.",
  star: "A small bright yellow star is perched at an angle on top of its head.",
  chef: "It wears a tall puffy white chef's hat.",
  flower: "A pink five-petal flower with a yellow centre is tucked on the top right of its head.",
  witch: "It wears a dark purple pointed witch hat (#4b3b6b) with a wide brim.",
  bat: "Two small dark purple bat wings and two tiny pointed ears poke out from the top of its head.",
  pumpkin: "A green pumpkin stem with a curly vine and one leaf grows from its top.",
  santa: "It wears a red Santa hat with white fluffy trim and a white pom-pom flopping to one side.",
  antlers: "Two small brown reindeer antlers sit on top of its head.",
  earmuffs: "It wears fluffy pale blue earmuffs (#9fb8e0) joined by a band over the top of its head.",
};

const PATTERNS = {
  none: "",
  speckle: "A sprinkle of tiny darker speckles covers its skin.",
  stripe: "Soft horizontal bands of a slightly darker shade wrap around its body.",
  swirl: "A soft swirl pattern of a slightly darker shade decorates its body, kept clear of the face.",
  hearts: "A few small pink-red hearts are scattered on its body, kept clear of the face.",
  dots: "A few small round dots of a slightly darker shade are scattered on its body, kept clear of the face.",
  web: "A neat, delicate pale grey spider-web pattern is drawn across its body. Friendly, not creepy.",
  snow: "A few small white snowflakes decorate its body.",
};

/** Characters that are not a plain bao bun. Written by hand; everything else comes from the data. */
const KIND = {
  "2c01": "It is a shumai: an open-topped dumpling with a frilled rim and a sunny orange filling showing at the top, instead of pleats and a top knot.",
  "2u01": "It is a shumai: an open-topped dumpling with a frilled rim and a sunny orange filling showing at the top, instead of pleats and a top knot.",
  "2c02": "It is a har gow shrimp dumpling: a glossy, slightly translucent pale pink wrapper with neat pleats along the top edge, a pink shrimp faintly visible inside.",
  "2e01": "It is a har gow shrimp dumpling: a glossy, slightly translucent peach wrapper with neat pleats along the top edge, a shrimp faintly visible inside.",
  "2c04": "It is a rice noodle roll: a soft, smooth rolled cylinder standing upright, with gentle folds showing as stripes, instead of pleats and a top knot.",
  "2c05": "It is a sticky rice parcel wrapped in a green lotus leaf, folded neatly like a little present and tied with a thin string, instead of pleats.",
  "2c06": "It is an egg tart: a round flaky golden pastry cup with a glossy yellow custard top, the face on the front of the pastry, instead of pleats.",
  "2c07": "It is a wonton: a soft wrapper gathered at the top into loose frilly folds instead of neat pleats.",
  "2c08": "It is a potsticker: a plump crescent-shaped dumpling with a pleated top edge and a crispy golden-brown bottom.",
  "2u04": "It is a sesame ball: a round golden fried ball covered all over in little white sesame seeds, instead of pleats and a top knot.",
  "3c01": "It is ribbed and shaped like a little pumpkin.",
  "3c02": "It is a little ghost of a dumpling: its bottom edge is a soft wavy hem like a bedsheet ghost.",
  "3u01": "It is coloured like candy corn: a yellow band at the bottom, an orange band in the middle, and a white tip at the top.",
  "3e01": "It is a jack-o'-lantern bun, ribbed like a pumpkin and glowing softly warm from inside.",
  "4r02": "It is gingerbread coloured, decorated with a few hurried squiggles and dots of white icing.",
  "4u02": "It is wrapped up in a loop of shiny green ribbon like a present, with the bow on top.",
  "r06": "It looks like a smooth grey river stone, but soft and squishy.",
  "e03": "It glows a warm orange, as if lit from inside.",
  "2l01": "Behind it, a small curl of steam rises in the shape of a tiny friendly dragon.",
  "e02": "It floats a little above the ground.",
};

/** A colour name for a hex, so the prompt says "pale pink" as well as #fbe3ec. Models follow words better than codes. */
export function colourName(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  // Chroma rather than HSL saturation: near white, HSL calls a cream "very saturated orange".
  if (d < 0.05) return l > 0.95 ? "white" : l > 0.7 ? "light grey" : "grey";
  let hue = h < 12 ? "red" : h < 22 ? "coral" : h < 40 ? "orange" : h < 52 ? "golden" : h < 66 ? "yellow"
    : h < 95 ? "lime green" : h < 150 ? "green" : h < 175 ? "mint" : h < 200 ? "aqua" : h < 225 ? "sky blue"
    : h < 250 ? "periwinkle blue" : h < 285 ? "lavender purple" : h < 330 ? "pink" : "rose pink";
  if (d < 0.14 && l > 0.8 && h >= 15 && h < 66) return "warm cream";
  if (l > 0.72 && (hue === "red" || hue === "rose pink")) hue = "pink";
  if ((hue === "orange" || hue === "golden") && l < 0.8 && d < 0.36) hue = "caramel brown";
  if (l > 0.78 && (hue === "coral" || hue === "orange")) hue = "peach";
  const tone = l > 0.9 ? "very pale " : l > 0.8 ? "pale " : l > 0.62 ? "soft " : l > 0.45 ? "" : "deep ";
  return `${tone}${hue}`;
}

/** Kinds whose own description says how the top is made, so the usual pleats-and-knot line would contradict it. */
const OWN_TOP = new Set(["2c01", "2u01", "2c02", "2e01", "2c04", "2c05", "2c06", "2c07", "2c08", "2u04"]);

export function dumplingPrompt(c) {
  const kind = KIND[c.id] ?? "";
  const parts = [
    STYLE_DUMPLING,
    `Its name is ${c.name}.`,
    kind,
    SHAPES[c.shape],
    `Body colour: ${colourName(c.body)} (${c.body}).`,
    OWN_TOP.has(c.id) ? "" : `It has ${Math.max(3, Math.min(7, c.pleats))} soft pleats gathered at a small top knot.`,
    FACES[c.face],
    `Blush: ${colourName(c.blush)} (${c.blush}) ovals on each cheek.`,
    HATS[c.hat],
    PATTERNS[c.pattern],
    `What its card in the game says about it: "${c.flavor}"`,
    "Simple bold shapes that read clearly when shown small.",
  ];
  return parts.filter(Boolean).join(" ");
}

/** The things in the buddy's three places, by spot id, plus the two states of the bowl and cup. */
export const PROPS = {
  "bowl": "A small round ceramic pet-style food bowl, cream with a blue rim, empty.",
  "bowl-full": "A small round ceramic pet-style food bowl, cream with a blue rim, heaped with little round rice balls and a few green peas.",
  "cup": "A small round teacup with no handle, pale green, empty.",
  "cup-full": "A small round teacup with no handle, pale green, full of warm tea with a curl of steam above it.",
  "plant": "A small potted house plant with a few big rounded green leaves in a terracotta pot.",
  "toys": "A small open wooden toy box with a ball, a building block and a little plush bear peeking out.",
  "window": "A small square window in a warm wooden frame, seen straight on, showing pale blue sky, one small cloud and a bit of sunshine.",
  "cushion": { wide: true, text: "A round, soft pink floor cushion seen from slightly above, wide and flat, like a little rug to sit on." },
  "puddle": { wide: true, text: "A small shallow puddle of clear blue water seen from slightly above, flat on the ground, wide and low, with a soft reflection." },
  "flowers": "A small clump of tulips, pink and yellow, with green leaves.",
  "hedge": "A small round green garden bush with soft rounded leaves.",
  "log": "A short mossy log lying on its side, with a little mushroom growing on it.",
  "tree": "A small young tree with a round green leafy top and a short brown trunk.",
  "grass": { wide: true, text: "A soft round patch of long green grass and clover seen from slightly above, wide and low, like a little nest to lie in." },
  "crumbs": "A small scatter of cookie crumbs and one half-eaten round cookie, flat on the floor.",
  "teapot": "A small round teapot, white with blue flowers.",
  "steamer": "A round bamboo steamer basket with its lid slightly open and a little puff of steam rising out.",
  "jar": "A small glass jar with a red checked cloth lid, half full of golden honey.",
  "shelf": "A small wooden kitchen shelf with two little tins and a jar on it.",
  "mat": { wide: true, text: "A round woven straw mat seen from slightly above, warm beige, wide and flat, like a little rug to sit on." },
};

/** The shop's baskets, by box id. */
export const BOXES = {
  steamer: "A round bamboo steamer basket with its lid on, warm honey-coloured bamboo, with a little puff of steam escaping.",
  golden: "A round woven basket painted shiny gold with a lid, a red ribbon tied around it.",
  feast: "A square gift box wrapped in red paper with a big gold ribbon bow on top.",
  bamboo: "A tall stack of two round green bamboo steamer baskets with a lid, a green bamboo leaf tucked at the side.",
  jade: "A small round jade-green porcelain box with a lid, decorated with a gold band.",
  treat: "A small orange trick-or-treat bag shaped like a smiling pumpkin bucket with a black handle. Cute, not scary.",
  haunted: "A round bamboo steamer basket with its lid on, draped with a little white ghost sheet with two dark eye holes. Cute, not scary.",
  stocking: "A red Christmas stocking with a white fluffy cuff, a candy cane poking out of the top.",
  sleigh: "A small red wooden sleigh with gold runners, carrying a wrapped present.",
};

export const PLACES = {
  room: "A cosy children's bedroom: the back wall is soft cream wallpaper with a faint pattern of small dots, with a pale wooden skirting board along the bottom of the wall. The floor is warm honey-coloured wooden floorboards running left to right. Nothing on the wall: no window, no shelves, no pictures.",
  garden: "A small sunny back garden: pale blue sky with two small soft clouds, a low white picket fence running across, a few rounded green hedge bushes and a couple of simple flowers along the fence. The floor is a flat open lawn of soft green grass, with only a few tiny flowers right at the left and right edges.",
  kitchen: "A cosy kitchen: the back wall is pale blue-green square tiles with soft grout lines, with a warm wooden counter edge running along the bottom of the wall. The floor is warm beige stone tiles. Nothing on the wall or the counter: no cupboards, no windows, no objects.",
};

export const STYLE = { STYLE_DUMPLING, STYLE_THING, STYLE_PLACE };
