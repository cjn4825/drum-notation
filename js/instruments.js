// Instrument definitions: staff key, notehead style, and the variant cycle
// each instrument supports when clicked repeatedly in edit mode.
//
// notehead codes are VexFlow key-suffixes: "n" = normal round notehead,
// "x2" = "x" notehead (used for cymbals / hi-hat).
//
// Order below is top-to-bottom pitch order (matches how they'd stack on
// a real staff), used to order the rows in both the notation legend and
// the edit grid.

var PICT_OPEN = String.fromCharCode(0xe7f8); // SMuFL "pictOpen" glyph (open hi-hat circle)

var INSTRUMENTS = [
  { id: "CR2", label: "Crash 2", key: "b/5", notehead: "x2", variants: ["normal", "accent"] },
  { id: "CR1", label: "Crash 1", key: "a/5", notehead: "x2", variants: ["normal", "accent"] },
  { id: "RD", label: "Ride", key: "g/5", notehead: "x2", variants: ["normal", "accent"] },
  { id: "HH", label: "Hi-Hat", key: "f/5", notehead: "x2", variants: ["normal", "open", "accent"] },
  { id: "T1", label: "High Tom", key: "f/5", notehead: "n", variants: ["normal", "accent"] },
  { id: "T2", label: "Mid Tom", key: "a/4", notehead: "n", variants: ["normal", "accent"] },
  { id: "SN", label: "Snare", key: "c/5", notehead: "n", variants: ["normal", "accent", "ghost"] },
  { id: "FT", label: "Floor Tom", key: "f/4", notehead: "n", variants: ["normal", "accent"] },
  { id: "BD", label: "Bass Drum", key: "d/4", notehead: "n", variants: ["normal", "accent"] },
];

var INSTRUMENTS_BY_ID = {};
INSTRUMENTS.forEach(function (inst) {
  INSTRUMENTS_BY_ID[inst.id] = inst;
});

// short label shown inside a filled grid cell for each variant
var VARIANT_LABEL = {
  normal: "●", // filled circle
  accent: ">",
  ghost: "( )",
  open: "o",
};

if (typeof module !== "undefined") {
  module.exports = { INSTRUMENTS: INSTRUMENTS, INSTRUMENTS_BY_ID: INSTRUMENTS_BY_ID, VARIANT_LABEL: VARIANT_LABEL, PICT_OPEN: PICT_OPEN };
}
