export type DatabaseViewProperty = {
  id: string;
  property: {
    config?: unknown;
    id: string;
    name: string;
    type: string;
  };
};

export type DatabaseSourceMenuItem = {
  config?: unknown;
  hiddenViewCount?: number;
  id: string;
  name: string;
  parentDatabaseId: string;
  position?: number;
  viewCount: number;
};
