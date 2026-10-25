// The Polyglot Vocab note type: its fields, card styling and card
// templates, used to set up a fresh Anki profile and to add languages to an
// existing one. The templates are generated from one pattern, matching the
// original hand-built note type: one card per language direction, audio
// inline, Notes under a "more" disclosure, and the Origin on the back.
// A note with its Listening field filled also gets a listening card for
// each of its languages. A note with ListeningOnly filled too (a paragraph
// made on the Listening tab) gets only those, not the usual directions.

// Languages in the order their fields appear. (A collection may also have
// Balinese fields from before; PolyglotBooster leaves those alone.)
export const noteLanguages = ["English", "Indonesian", "Thai", "Japanese", "Spanish", "French", "Mandarin"] as const;
export type NoteLanguage = typeof noteLanguages[number];

// Notes_English sits right under English so a question written in it (e.g.
// when flagging a card) is in view in Anki's editor without scrolling.
// Audio2_<Language> holds a second recording (another voice, or the
// textbook's) that plays after the first. English has none: it's never
// recorded (see audioLanguages).
export const spokenLanguages = noteLanguages.filter((language) => language !== "English");
export const listeningField = "Listening";
export const listeningOnlyField = "ListeningOnly";

export const vocabNoteFields = [
  "English",
  "Notes_English",
  ...spokenLanguages,
  ...noteLanguages.map((language) => `Audio_${language}`),
  ...spokenLanguages.map((language) => `Notes_${language}`),
  "Origin",
  ...spokenLanguages.map((language) => `Audio2_${language}`),
  listeningField,
  listeningOnlyField,
];

// Card directions. Each pair gets a card both ways; a card only exists for a
// note when both of its fields are filled.
const pairs: [NoteLanguage, NoteLanguage][] = [
  ["English", "Indonesian"], ["English", "Thai"], ["English", "Japanese"],
  ["Indonesian", "Thai"], ["Indonesian", "Japanese"], ["Thai", "Japanese"],
  ["English", "Spanish"], ["English", "French"], ["English", "Mandarin"],
  ["Spanish", "French"], ["Mandarin", "Japanese"], ["Mandarin", "Thai"],
];

// Languages whose reading (romanization, furigana, pinyin) is worth seeing
// on the front of a card into English.
const readingOnFront = new Set<NoteLanguage>(["Thai", "Japanese", "Mandarin"]);

function audio(language: NoteLanguage) {
  const second = language === "English" ? "" : `\n{{#Audio2_${language}}}{{Audio2_${language}}}{{/Audio2_${language}}}`;
  return `{{#Audio_${language}}}{{Audio_${language}}}{{/Audio_${language}}}${second}`;
}

function front(from: NoteLanguage, to: NoteLanguage) {
  const notes = to === "English" && readingOnFront.has(from)
    ? `{{#Notes_${from}}}
<details class="more">
<summary>more</summary>
{{Notes_${from}}}
</details>
{{/Notes_${from}}}
`
    : "";
  return `{{^${listeningOnlyField}}}{{#${from}}}{{#${to}}}
<div class="tag">${from.toUpperCase()}</div>
<div class="prompt">{{${from}}}</div>
${audio(from)}
${notes}{{/${to}}}{{/${from}}}{{/${listeningOnlyField}}}`;
}

function back(to: NoteLanguage) {
  return `{{FrontSide}}
<hr id="answer">
<div class="tag">${to.toUpperCase()}</div>
<div class="answer">{{${to}}}</div>
${audio(to)}
{{#Origin}}
<details class="more">
<summary>more</summary>
<div class="origin">origin: {{Origin}}</div>
{{#Notes_${to}}}{{Notes_${to}}}{{/Notes_${to}}}
</details>
{{/Origin}}
{{^Origin}}
{{#Notes_${to}}}
<details class="more">
<summary>more</summary>
{{Notes_${to}}}
</details>
{{/Notes_${to}}}
{{/Origin}}`;
}

export type CardTemplate = { Name: string; Front: string; Back: string };

export function cardTemplate(from: NoteLanguage, to: NoteLanguage): CardTemplate {
  return { Name: `${from} → ${to}`, Front: front(from, to), Back: back(to) };
}

// The listening cards' player: back 10 s, back 5 s, play/pause and loop for
// each recording. Anki turns [sound:] tags into its own play button, which
// can't seek, and hides the filename from the card's script, so
// PolyglotBooster also writes the filename in a pb-src span next to the tag
// (see soundField). A recording without one keeps Anki's own button.
const listeningPlayer = `<script>
(function () {
  var boxes = document.querySelectorAll(".pb-listen:not([data-ready])");
  var players = [];
  for (var b = 0; b < boxes.length; b++) {
    boxes[b].setAttribute("data-ready", "");
    var tracks = boxes[b].querySelectorAll(".pb-track");
    for (var t = 0; t < tracks.length; t++) addPlayer(tracks[t]);
  }
  function button(text, title, onClick) {
    var el = document.createElement("button");
    el.type = "button";
    el.textContent = text;
    el.title = title;
    el.setAttribute("aria-label", title);
    el.addEventListener("click", function (event) { event.stopPropagation(); onClick(el); });
    return el;
  }
  function addPlayer(track) {
    var src = track.querySelector(".pb-src");
    if (!src) return;
    var audio = new Audio(src.getAttribute("data-src"));
    players.push(audio);
    function start() {
      for (var i = 0; i < players.length; i++) if (players[i] !== audio) players[i].pause();
      audio.play();
    }
    function back(seconds) {
      audio.currentTime = Math.max(0, audio.currentTime - seconds);
      if (audio.paused) start();
    }
    var controls = document.createElement("div");
    controls.className = "pb-player";
    var label = document.createElement("span");
    label.className = "pb-player-label";
    label.textContent = track.getAttribute("data-track");
    var play = button("▶", "Play", function () { if (audio.paused) start(); else audio.pause(); });
    var loop = button("🔁", "Loop", function (el) {
      audio.loop = !audio.loop;
      el.className = audio.loop ? "active" : "";
      if (audio.loop && audio.paused) start();
    });
    audio.addEventListener("play", function () { play.textContent = "⏸"; play.title = "Pause"; });
    audio.addEventListener("pause", function () { play.textContent = "▶"; play.title = "Play"; });
    audio.addEventListener("ended", function () { play.textContent = "▶"; play.title = "Play"; });
    audio.addEventListener("error", function () { track.classList.remove("pb-has-player"); controls.remove(); });
    controls.appendChild(label);
    controls.appendChild(button("↺10", "Back 10 seconds", function () { back(10); }));
    controls.appendChild(button("↺5", "Back 5 seconds", function () { back(5); }));
    controls.appendChild(play);
    controls.appendChild(loop);
    track.appendChild(controls);
    track.classList.add("pb-has-player");
  }
})();
</script>`;

export function listeningTemplateName(language: NoteLanguage) {
  return `${language} listening`;
}

// A listening card: the front is only the recordings (Anki plays both, one
// after the other); the back shows the text and plays the first recording
// again, with the English translation and the notes under "more". Until
// there's a recording the front shows the text instead. Anki only makes a
// card whose front shows some field, and PolyglotBooster records the audio
// after adding the note.
export function listeningTemplate(language: NoteLanguage): CardTemplate {
  const more = (english: string) => `<details class="more">
<summary>more</summary>
${english}{{Notes_${language}}}
</details>`;
  return {
    Name: listeningTemplateName(language),
    Front: `{{#${listeningField}}}{{#${language}}}
<div class="tag">${language.toUpperCase()} · LISTENING</div>
<div class="pb-listen">
<div class="pb-track" data-track="1">{{Audio_${language}}}</div>
{{#Audio2_${language}}}<div class="pb-track" data-track="2">{{Audio2_${language}}}</div>{{/Audio2_${language}}}
</div>
{{^Audio_${language}}}<div class="listening-text">{{${language}}}</div>{{/Audio_${language}}}
${listeningPlayer}
{{/${language}}}{{/${listeningField}}}`,
    Back: `<div class="tag">${language.toUpperCase()} · LISTENING</div>
<div class="listening-text">{{${language}}}</div>
<div class="pb-listen">
<div class="pb-track" data-track="1">{{Audio_${language}}}</div>
</div>
${listeningPlayer}
{{#English}}
${more(`<div class="listening-english">{{English}}</div>\n`)}
{{/English}}
{{^English}}
{{#Notes_${language}}}
${more("")}
{{/Notes_${language}}}
{{/English}}`,
  };
}

// Into-English directions first, then the rest, as in the original, then
// the listening cards.
export const vocabCardTemplates: CardTemplate[] = [
  ...pairs.filter(([a]) => a === "English").map(([, b]) => cardTemplate("English", b)),
  ...pairs.filter(([a]) => a === "English").map(([, b]) => cardTemplate(b, "English")),
  ...pairs.filter(([a]) => a !== "English").flatMap(([a, b]) => [cardTemplate(a, b), cardTemplate(b, a)]),
  ...spokenLanguages.map(listeningTemplate),
];

// Styling for the listening cards. Setting up listening adds it to an
// existing note type's own CSS, which may have been adjusted by hand.
export const listeningCss = `

/* PolyglotBooster listening cards */
.listening-text {
  font-size: 26px;
  line-height: 1.6;
  text-align: left;
  max-width: 640px;
  margin: 0 auto 12px;
}

.listening-english {
  margin-bottom: 10px;
}

.pb-listen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 14px 0;
}

.pb-src,
.pb-has-player .replay-button,
.pb-has-player .soundLink {
  display: none;
}

.pb-player {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pb-player-label {
  font-size: 13px;
  color: #8a8a8a;
  min-width: 14px;
}

.pb-player button {
  font: inherit;
  font-size: 18px;
  min-width: 52px;
  min-height: 44px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #fff;
  color: #1a1a1a;
  cursor: pointer;
}

.pb-player button.active {
  background: #0e6b56;
  border-color: #0e6b56;
  color: #fff;
}`;

export const vocabNoteCss = ".card {\n  font-family: -apple-system, \"Segoe UI\", \"Noto Sans Thai\", \"Noto Sans JP\", \"Noto Sans\", sans-serif;\n  font-size: 28px;\n  text-align: center;\n  color: #1a1a1a;\n  background-color: #fafafa;\n  padding: 24px 20px;\n}\n\n.tag {\n  font-size: 13px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: #8a8a8a;\n  margin-bottom: 8px;\n}\n\n.prompt {\n  font-size: 34px;\n  line-height: 1.3;\n}\n\nhr#answer {\n  margin: 22px auto;\n  width: 60%;\n  border: none;\n  border-top: 1px solid #ddd;\n}\n\n.answer {\n  font-size: 34px;\n  line-height: 1.3;\n  color: #0e6b56;\n  margin-bottom: 10px;\n}\n\ndetails.more {\n  margin: 18px auto 0;\n  text-align: left;\n  display: inline-block;\n  max-width: 480px;\n  font-size: 16px;\n  line-height: 1.5;\n  color: #3a3a3a;\n}\n\ndetails.more summary {\n  cursor: pointer;\n  text-align: center;\n  color: #8a8a8a;\n  font-size: 13px;\n  letter-spacing: 0.04em;\n}\n\ndetails.more[open] summary {\n  margin-bottom: 10px;\n}\n\n.origin {\n  margin-top: 16px;\n  display: inline-block;\n  font-size: 11px;\n  letter-spacing: 0.03em;\n  padding: 3px 10px;\n  border-radius: 20px;\n  background: #eeeeee;\n  color: #999999;\n}\n\ndetails.more .origin {\n  margin-top: 0;\n  margin-bottom: 10px;\n}" + listeningCss;
