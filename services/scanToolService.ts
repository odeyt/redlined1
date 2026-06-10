export function connectScanTool(): { status: string; adapter: string; protocol: string } {
  return {
    status: 'Connected',
    adapter: 'Simulated OBD-II interface',
    protocol: 'ISO 15765-4 CAN',
  };
}

export function readTroubleCodes(): string[] {
  return ['P0420', 'U0100'];
}

export function clearTroubleCodes(): string[] {
  return [];
}
