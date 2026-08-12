const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSliceAssetName,
  normalizeSliceAssetNames,
  reserveSliceAssetName
} = require("../../src/core/slice-asset-name");

test("normalizeSliceAssetName creates one lowercase English snake-case name", () => {
  assert.equal(normalizeSliceAssetName("Woodcarving Course-Cover.PNG"), "woodcarving_course_cover");
  assert.equal(normalizeSliceAssetName("  gradient__flag icon  "), "gradient_flag_icon");
  assert.equal(normalizeSliceAssetName("非遗手作体验日活动照片"), "");
});

test("reserveSliceAssetName uses slice numbering and stable duplicate suffixes", () => {
  const used = new Set(["slice_01", "course_cover"]);
  assert.equal(reserveSliceAssetName("", used), "slice_02");
  assert.equal(reserveSliceAssetName("Course Cover", used), "course_cover_2");
  assert.deepEqual([...used], ["slice_01", "course_cover", "slice_02", "course_cover_2"]);
});

test("normalizeSliceAssetNames migrates old records without guessing Chinese semantics", () => {
  const assets = [
    { id: "a", name: "木雕技艺体验课封面" },
    { id: "b", name: "Course Cover" },
    { id: "c", name: "course-cover" },
    { id: "d", name: "图标候选 5" }
  ];

  assert.equal(normalizeSliceAssetNames(assets), true);
  assert.deepEqual(assets.map((asset) => asset.name), [
    "slice_01",
    "course_cover",
    "course_cover_2",
    "slice_02"
  ]);
  assert.equal(normalizeSliceAssetNames(assets), false);
});
