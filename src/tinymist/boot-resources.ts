import tinymistWasmUrl from "tinymist/tinymist_bg.wasm?url";

type BootResourceGroupId = "compiler" | "cjk-fonts" | "latin-fonts";

type BootResource = {
  groupId: BootResourceGroupId;
  name: string;
  url: string;
  sizeBytes: number;
};

type BootResourceGroupState = {
  id: BootResourceGroupId;
  label: string;
  loadedBytes: number;
  totalBytes: number;
  complete: boolean;
};

export type BootResourceProgress = {
  loadedBytes: number;
  totalBytes: number;
  groups: BootResourceGroupState[];
};

export type TinymistBootResources = {
  compilerWasm: Uint8Array;
  fonts: Uint8Array[];
};

const cjkFonts = [
  ["SourceHanSerifSC-Regular.otf", 24_425_144],
  ["SourceHanSerifSC-Bold.otf", 25_425_320]
] as const;
const cjkFontResources = cjkFonts.map(([name, sizeBytes]) =>
  createFontResource("cjk-fonts", name, sizeBytes)
);

const latinFonts = [
  ["Charter Regular.ttf", 35_060],
  ["Charter Bold.ttf", 35_380],
  ["Charter Italic.ttf", 37_004],
  ["Charter Bold Italic.ttf", 37_488],
  ["BlexMonoNerdFontMono-Regular.ttf", 1_883_936],
  ["BlexMonoNerdFontMono-Bold.ttf", 1_886_144],
  ["BlexMonoNerdFontMono-Italic.ttf", 1_892_180]
] as const;
const latinFontResources = latinFonts.map(([name, sizeBytes]) =>
  createFontResource("latin-fonts", name, sizeBytes)
);

const resources = {
  compiler: [
    {
      groupId: "compiler",
      name: "tinymist_bg.wasm",
      url: tinymistWasmUrl,
      sizeBytes: 38_835_223
    }
  ],
  cjkFonts: cjkFontResources,
  latinFonts: latinFontResources
} satisfies Record<string, BootResource[]>;

const groupLabels: Record<BootResourceGroupId, string> = {
  compiler: "正在加载编译器和语言服务器",
  "cjk-fonts": "正在加载所用中文字体",
  "latin-fonts": "正在加载所用英文字体"
};

export function createInitialBootResourceProgress(): BootResourceProgress {
  return snapshotProgress(createInitialGroupStates());
}

export async function loadBootResources(
  onProgress: (progress: BootResourceProgress) => void
): Promise<TinymistBootResources> {
  const groups = createInitialGroupStates();
  const emit = () => onProgress(snapshotProgress(groups));

  emit();

  const [compilerBytes, cjkFontBytes, latinFontBytes] = await Promise.all([
    loadGroup(resources.compiler, groups, emit),
    loadGroup(resources.cjkFonts, groups, emit),
    loadGroup(resources.latinFonts, groups, emit)
  ]);
  const compilerWasm = compilerBytes[0];

  if (!compilerWasm) {
    throw new Error("Compiler wasm was not loaded");
  }

  return {
    compilerWasm,
    fonts: [...cjkFontBytes, ...latinFontBytes]
  };
}

function createInitialGroupStates() {
  return new Map<BootResourceGroupId, BootResourceGroupState>(
    (Object.entries(groupLabels) as Array<[BootResourceGroupId, string]>).map(([id, label]) => [
      id,
      {
        id,
        label,
        loadedBytes: 0,
        totalBytes: resourcesForGroup(id).reduce((sum, resource) => sum + resource.sizeBytes, 0),
        complete: false
      }
    ])
  );
}

async function loadGroup(
  groupResources: BootResource[],
  groups: Map<BootResourceGroupId, BootResourceGroupState>,
  emit: () => void
) {
  const bytes = await Promise.all(
    groupResources.map((resource) => downloadResource(resource, groups, emit))
  );
  const group = getGroup(groups, groupResources[0].groupId);

  group.complete = true;
  group.totalBytes = Math.max(group.totalBytes, group.loadedBytes);
  emit();

  return bytes;
}

async function downloadResource(
  resource: BootResource,
  groups: Map<BootResourceGroupId, BootResourceGroupState>,
  emit: () => void
) {
  const group = getGroup(groups, resource.groupId);
  const response = await fetch(resource.url);

  if (!response.ok) {
    throw new Error(`Failed to load ${resource.name}: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > resource.sizeBytes) {
    group.totalBytes += contentLength - resource.sizeBytes;
    emit();
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    group.loadedBytes += bytes.byteLength;
    emit();
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let resourceLoadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    resourceLoadedBytes += value.byteLength;
    group.loadedBytes += value.byteLength;
    emit();
  }

  if (resourceLoadedBytes > resource.sizeBytes) {
    group.totalBytes += resourceLoadedBytes - resource.sizeBytes;
    emit();
  }

  return concatBytes(chunks);
}

function createFontResource(
  groupId: "cjk-fonts" | "latin-fonts",
  name: string,
  sizeBytes: number
): BootResource {
  return {
    groupId,
    name,
    url: `${import.meta.env.BASE_URL}assets/fonts/${encodeURIComponent(name)}`,
    sizeBytes
  };
}

function resourcesForGroup(id: BootResourceGroupId): BootResource[] {
  if (id === "compiler") {
    return resources.compiler;
  }

  if (id === "cjk-fonts") {
    return resources.cjkFonts;
  }

  return resources.latinFonts;
}

function getGroup(groups: Map<BootResourceGroupId, BootResourceGroupState>, id: BootResourceGroupId) {
  const group = groups.get(id);

  if (!group) {
    throw new Error(`Unknown boot resource group: ${id}`);
  }

  return group;
}

function snapshotProgress(
  groups: Map<BootResourceGroupId, BootResourceGroupState>
): BootResourceProgress {
  const groupList = [...groups.values()].map((group) => ({ ...group }));

  return {
    groups: groupList,
    loadedBytes: groupList.reduce((sum, group) => sum + group.loadedBytes, 0),
    totalBytes: groupList.reduce((sum, group) => sum + group.totalBytes, 0)
  };
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}
