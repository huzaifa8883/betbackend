const { settleBetsForClosedEvents } = require('./Orders');

async function testSettlement() {
  console.log("Running mock settlement...");
  await settleBetsForClosedEvents(true); // test=true → mock use
  console.log("Mock settlement completed.");
}

testSettlement();
