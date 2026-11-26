/**
 * A curated emoji set with search keywords (kept small so the picker needs no
 * extra download). Each entry: "emoji keyword keyword …".
 */

export type EmojiCategory = { id: string; label: string; icon: string; emojis: Array<{ char: string; keywords: string }> };

const raw: Array<[string, string, string, string[]]> = [
  ["smileys", "Smileys", "😀", [
    "😀 grin smile happy", "😃 smile happy joy", "😄 smile laugh happy", "😁 grin beam", "😆 laugh haha lol", "😅 sweat smile relief",
    "🤣 rofl laugh lol", "😂 joy tears laugh lol", "🙂 slight smile", "🙃 upside down silly", "😉 wink", "😊 blush smile happy",
    "😇 angel innocent halo", "🥰 love hearts adore", "😍 heart eyes love", "🤩 star struck wow", "😘 kiss love", "😗 kiss",
    "😚 kiss blush", "😋 yum tasty delicious", "😛 tongue playful", "😜 wink tongue crazy", "🤪 zany crazy silly", "😝 tongue squint",
    "🤑 money rich", "🤗 hug hugs", "🤭 oops giggle", "🤫 shush quiet secret", "🤔 thinking hmm think", "🤐 zipper mouth secret",
    "🤨 raised eyebrow suspicious", "😐 neutral meh", "😑 expressionless", "😶 no mouth speechless", "😏 smirk", "😒 unamused annoyed",
    "🙄 eye roll whatever", "😬 grimace awkward", "😮‍💨 exhale relief sigh", "🤥 liar lying", "😌 relieved calm", "😔 pensive sad",
    "😪 sleepy tired", "🤤 drool", "😴 sleeping zzz tired", "😷 mask sick", "🤒 sick fever ill", "🤕 hurt injured",
    "🤢 nauseous sick", "🤮 vomit sick", "🥵 hot sweating", "🥶 cold freezing", "🥴 woozy dizzy drunk", "😵 dizzy",
    "🤯 mind blown shocked", "🤠 cowboy", "🥳 party celebrate birthday", "😎 cool sunglasses", "🤓 nerd geek", "🧐 monocle curious",
    "😕 confused", "😟 worried", "🙁 frown sad", "😮 surprised wow", "😯 hushed surprised", "😲 astonished shocked",
    "😳 flushed embarrassed", "🥺 pleading puppy eyes please", "😦 frowning", "😧 anguished", "😨 fearful scared", "😰 anxious sweat",
    "😥 sad relieved", "😢 cry sad tear", "😭 sob crying sad", "😱 scream scared shock", "😖 confounded", "😣 persevere",
    "😞 disappointed sad", "😓 sweat downcast", "😩 weary tired", "😫 tired exhausted", "🥱 yawn bored tired", "😤 triumph huff",
    "😡 angry rage mad", "😠 angry mad", "🤬 cursing swearing angry", "😈 devil smiling evil", "💀 skull dead lol", "💩 poop",
    "🤡 clown", "👻 ghost boo", "👽 alien", "🤖 robot bot",
  ]],
  ["gestures", "People & gestures", "👍", [
    "👍 thumbs up like yes ok", "👎 thumbs down dislike no", "👌 ok perfect", "🤌 pinched fingers italian", "✌️ peace victory", "🤞 fingers crossed luck",
    "🤟 love you sign", "🤘 rock on metal", "🤙 call me shaka", "👈 point left", "👉 point right", "👆 point up",
    "👇 point down", "☝️ index up one", "✋ raised hand stop high five", "🖐️ hand fingers", "🖖 vulcan salute", "👋 wave hello hi bye",
    "👏 clap applause bravo", "🙌 raised hands celebrate hooray", "👐 open hands", "🤲 palms up", "🤝 handshake deal agree", "🙏 pray please thanks namaste",
    "✍️ writing", "💪 muscle strong flex", "🫶 heart hands love", "👀 eyes look see", "🧠 brain smart", "🫡 salute respect",
    "🙋 raise hand question", "🙆 ok gesture", "🙅 no gesture", "🤷 shrug dunno", "🤦 facepalm", "💁 info tipping hand",
    "🧑‍💻 coder developer laptop", "🧑‍🎓 student graduate", "🧑‍🏫 teacher", "🧑‍🍳 cook chef", "🏃 run running", "💃 dance party",
  ]],
  ["hearts", "Hearts & symbols", "❤️", [
    "❤️ red heart love", "🧡 orange heart", "💛 yellow heart", "💚 green heart", "💙 blue heart", "💜 purple heart",
    "🖤 black heart", "🤍 white heart", "🤎 brown heart", "💔 broken heart sad", "❣️ heart exclamation", "💕 two hearts love",
    "💞 revolving hearts", "💓 beating heart", "💗 growing heart", "💖 sparkling heart", "💘 cupid arrow love", "💝 gift heart",
    "✨ sparkles shiny new", "⭐ star", "🌟 glowing star", "💫 dizzy star", "🔥 fire lit hot", "💯 hundred perfect",
    "✅ check done yes", "☑️ checkbox done", "✔️ check mark", "❌ cross no wrong", "❗ exclamation important", "❓ question",
    "⚠️ warning caution", "🚫 prohibited no", "💤 sleep zzz", "💬 speech chat message", "💭 thought bubble", "🔔 bell notification",
    "📌 pin pinned", "📍 location pin", "🎯 target goal bullseye", "🆗 ok button", "🆕 new", "🔴 red circle",
    "🟢 green circle", "🔵 blue circle", "⚡ lightning fast zap", "➕ plus add", "➖ minus", "♻️ recycle",
  ]],
  ["animals", "Animals & nature", "🐶", [
    "🐶 dog puppy", "🐱 cat kitty", "🐭 mouse", "🐹 hamster", "🐰 rabbit bunny", "🦊 fox",
    "🐻 bear", "🐼 panda", "🐨 koala", "🐯 tiger", "🦁 lion", "🐮 cow",
    "🐷 pig", "🐸 frog", "🐵 monkey", "🙈 see no evil monkey", "🙉 hear no evil", "🙊 speak no evil",
    "🐔 chicken", "🐧 penguin", "🐦 bird", "🦄 unicorn", "🐝 bee", "🦋 butterfly",
    "🐢 turtle slow", "🐍 snake", "🐙 octopus", "🐬 dolphin", "🐳 whale", "🦈 shark",
    "🌸 cherry blossom flower", "🌹 rose flower", "🌻 sunflower", "🌷 tulip", "🌵 cactus", "🌴 palm tree",
    "🍀 four leaf clover luck", "🍁 maple leaf autumn", "🌈 rainbow", "☀️ sun sunny", "🌙 moon night", "⛅ cloud sun",
    "🌧️ rain", "❄️ snow cold", "🌊 wave ocean sea", "🌍 earth world globe",
  ]],
  ["food", "Food & drink", "🍕", [
    "🍎 apple", "🍌 banana", "🍉 watermelon", "🍓 strawberry", "🍒 cherries", "🥭 mango",
    "🍍 pineapple", "🥑 avocado", "🍅 tomato", "🌽 corn", "🥕 carrot", "🌶️ chili hot spicy",
    "🍕 pizza", "🍔 burger hamburger", "🍟 fries", "🌭 hot dog", "🌮 taco", "🍜 noodles ramen",
    "🍛 curry rice", "🍚 rice", "🍣 sushi", "🥗 salad", "🍿 popcorn movie", "🍩 donut",
    "🍪 cookie", "🎂 birthday cake", "🍰 cake slice", "🍫 chocolate", "🍦 ice cream", "🍭 lollipop candy",
    "☕ coffee tea hot", "🍵 tea", "🧋 bubble tea boba", "🥤 soda drink", "🍺 beer", "🍻 cheers beers",
    "🥂 cheers celebrate toast", "🍷 wine", "🍾 champagne celebrate", "🥛 milk", "🧃 juice", "🍽️ dinner plate",
  ]],
  ["activities", "Activities & travel", "⚽", [
    "⚽ soccer football", "🏀 basketball", "🏏 cricket", "🎾 tennis", "🏐 volleyball", "🏓 ping pong",
    "🏸 badminton", "🥊 boxing", "🎮 video game gaming", "🎲 dice game", "♟️ chess", "🎯 darts",
    "🎳 bowling", "🏆 trophy win champion", "🥇 gold medal first", "🎉 party tada celebrate", "🎊 confetti", "🎈 balloon",
    "🎁 gift present", "🎵 music note", "🎶 music notes", "🎧 headphones music", "🎤 microphone sing", "🎬 movie film",
    "📷 camera photo", "🎨 art paint", "✈️ airplane travel flight", "🚗 car drive", "🚕 taxi", "🚌 bus",
    "🚆 train", "🚲 bike bicycle", "🏠 house home", "🏢 office building", "🏖️ beach vacation", "⛰️ mountain",
    "🗺️ map", "🧳 luggage travel", "⏰ alarm clock time", "⌛ hourglass time", "🚀 rocket launch ship it", "🛸 ufo",
  ]],
  ["objects", "Objects & work", "💡", [
    "💡 idea light bulb", "💻 laptop computer", "🖥️ desktop computer", "⌨️ keyboard", "🖱️ mouse computer", "📱 phone mobile",
    "☎️ telephone call", "📞 phone call", "📧 email mail", "✉️ envelope letter", "📨 incoming mail", "📦 package box shipping",
    "📁 folder files", "📂 open folder", "📄 page document", "📃 document curl", "📝 memo note write", "📋 clipboard",
    "📊 bar chart stats", "📈 chart up growth", "📉 chart down", "🗂️ dividers files", "🗓️ calendar", "📅 calendar date",
    "📎 paperclip attachment", "🖇️ paperclips", "✂️ scissors cut", "🖊️ pen", "✏️ pencil", "🔍 search magnifier",
    "🔒 lock locked secure", "🔓 unlock", "🔑 key password", "🛠️ tools fix build", "⚙️ gear settings", "🧪 test lab",
    "🐛 bug", "💾 save floppy disk", "🗑️ trash delete", "🔗 link chain", "📣 megaphone announce", "💰 money bag",
    "💳 card payment", "🧾 receipt", "📚 books study", "📖 book read", "🖼️ picture image", "🎥 video camera",
  ]],
];

export const EMOJI_CATEGORIES: EmojiCategory[] = raw.map(([id, label, icon, entries]) => ({
  id,
  label,
  icon,
  emojis: entries.map((entry) => {
    const space = entry.indexOf(" ");
    return { char: entry.slice(0, space), keywords: entry.slice(space + 1) };
  }),
}));

export const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((category) => category.emojis);
