export interface Quote {
  id: string;
  faction: string;
  speaker: string;
  text: string;
  source: string;
}

export interface QuotesDatabase {
  version: 1;
  count: number;
  factions: string[];
  quotes: Quote[];
}
