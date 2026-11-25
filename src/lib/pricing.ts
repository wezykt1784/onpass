// Public prices, in pence, excluding VAT. One place so the landing page and (later) billing agree.
export const TIERS = [
  { id: "kitchen", name: "Kitchen", forWho: "1 to 4 sites", monthly: 3900, annual: 39000, support: "Email support" },
  { id: "group", name: "Group", forWho: "5 to 49 sites", monthly: 2400, annual: 24000, support: "Email and phone support" },
  { id: "estate", name: "Estate", forWho: "50 sites or more", monthly: null, annual: 16000, support: "A named contact, and your recipes loaded for you" },
] as const;

export const pounds = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
