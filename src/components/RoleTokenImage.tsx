import { ReactNode, useMemo, useState } from "react";
import type { ScriptRole } from "../types";
import { getRoleLabel } from "../utils/scripts";
import { getTokenImageUrls } from "../utils/tokenImages";

type RoleTokenImageProps = {
  roleId?: string;
  roles?: ScriptRole[];
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
};

export default function RoleTokenImage({
  roleId,
  roles = [],
  className,
  imageClassName,
  fallback = null,
}: RoleTokenImageProps) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const urls = useMemo(() => getTokenImageUrls(roleId, roles), [roleId, roles]);
  const src = urls.find((url) => !failedUrls.includes(url));

  if (!roleId || !src) {
    return fallback;
  }

  return (
    <span className={className}>
      <img
        src={src}
        alt={getRoleLabel(roleId, roles)}
        className={imageClassName}
        draggable={false}
        onError={() => setFailedUrls((current) => (current.includes(src) ? current : [...current, src]))}
      />
    </span>
  );
}
