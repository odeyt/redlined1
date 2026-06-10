export function connectScanTool() {
  return {
    status: "Connected",
    adapter: "Simulated OBD-II interface",
    protocol: "ISO 15765-4 CAN"
  };
}

export function readTroubleCodes() {
  return ["P0420", "U0100"];
}

export function clearTroubleCodes() {
  return [];
}
