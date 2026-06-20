export type ChapterStep = {
  id: string;
  title: string;
  source: string;
};

export type Chapter = {
  id: string;
  number: string;
  title: string;
  deck: string;
  steps: ChapterStep[];
};

export type ChapterCatalogItem = {
  id: string;
  number: string;
  title: string;
  loader: () => Promise<Chapter>;
};
