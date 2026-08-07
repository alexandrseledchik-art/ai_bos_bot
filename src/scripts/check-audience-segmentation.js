import assert from "node:assert/strict";

import { buildAudienceProfile } from "../domain/audience-segmentation.js";

const managementOwner = buildAudienceProfile({
  userText: "Я собственник среднего бизнеса. Бизнес вырос, но управляемость не успела: непонятно, кто за что отвечает и каким цифрам верить.",
  orchestration: { operatingMode: "diagnostician" }
});
assert.equal(managementOwner.humanRole.value, "owner");
assert.equal(managementOwner.businessSize.value, "medium");
assert.equal(managementOwner.businessState.values.includes("management_gap"), true);
assert.equal(managementOwner.primarySegment?.id, "owner_medium_management_gap");

const scalingOwner = buildAudienceProfile({
  userText: "Я собственник растущего бизнеса перед масштабированием. Боюсь, что рост усилит хаос в процессах и команда не удержит рост.",
  orchestration: { operatingMode: "diagnostician" }
});
assert.equal(scalingOwner.developmentStage.value, "scaling");
assert.equal(scalingOwner.businessState.values.includes("process_chaos"), true);
assert.equal(scalingOwner.primarySegment?.id, "owner_pre_scaling_control_risk");

const expert = buildAudienceProfile({
  userText: "Я консультант. Хочу упаковать свою методологию в продукт для консалтинга.",
  orchestration: { operatingMode: "methodology_expert" }
});
assert.equal(expert.humanRole.value, "consultant");
assert.equal(expert.currentTask.value, "package_methodology");
assert.equal(expert.primarySegment?.id, "expert_methodology_productization");

const reader = buildAudienceProfile({
  userText: "Я читатель книги, пришёл по QR-коду и хочу попробовать идею на своём бизнесе.",
  orchestration: { operatingMode: "methodology_expert" }
});
assert.equal(reader.humanRole.value, "book_reader");
assert.equal(reader.entryChannel.value, "book");
assert.deepEqual(reader.channelPath, ["book", "qr", "telegram"]);
assert.equal(reader.nurtureOnly, true);
assert.equal(reader.primarySegment, null);

const noPrematureSegment = buildAudienceProfile({
  userText: "Хочу разобраться с бизнесом.",
  orchestration: { operatingMode: "diagnostician" }
});
assert.equal(noPrematureSegment.primarySegment, null);
assert.equal(noPrematureSegment.entryChannel.value, "telegram");

const ownerAxisOnly = buildAudienceProfile({
  userText: "Я собственник среднего бизнеса.",
  orchestration: { operatingMode: "diagnostician" }
});
assert.equal(ownerAxisOnly.primarySegment, null);

const accumulatedManagementOwner = buildAudienceProfile({
  userText: "Управляемость не успела за ростом, нет единой картины данных. Хочу понять, что чинить первым.",
  orchestration: { operatingMode: "diagnostician" },
  previousProfile: ownerAxisOnly
});
assert.equal(accumulatedManagementOwner.primarySegment?.id, "owner_medium_management_gap");

const readerFollowUp = buildAudienceProfile({
  userText: "Теперь хочу применить это к своей ситуации.",
  orchestration: { operatingMode: "diagnostician" },
  previousProfile: reader
});
assert.equal(readerFollowUp.entryChannel.value, "book");
assert.deepEqual(readerFollowUp.channelPath, ["book", "qr", "telegram"]);
assert.equal(readerFollowUp.nurtureOnly, true);

console.log("Audience segmentation checks passed: axes stay separate and priority intersections qualify correctly.");
