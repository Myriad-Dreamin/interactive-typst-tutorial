export type ChapterStep = {
  id: string;
  title: string;
  sourcePath: string;
  source: string;
};

export type TypstSourceFile = {
  path: string;
  source: string;
};

export type Chapter = {
  id: string;
  number: string;
  title: string;
  deck: string;
  sourceFiles: TypstSourceFile[];
  steps: ChapterStep[];
};

export type ChapterCatalogItem = {
  id: string;
  number: string;
  title: string;
  loader: () => Promise<Chapter>;
};
