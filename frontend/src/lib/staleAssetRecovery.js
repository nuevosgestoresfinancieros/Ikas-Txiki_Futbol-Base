export const isStaleAssetError = (error) => {
  const message = String(error?.message || error || "");
  return /ChunkLoadError|Loading chunk .* failed|Unexpected token ['"]?</i.test(message);
};

