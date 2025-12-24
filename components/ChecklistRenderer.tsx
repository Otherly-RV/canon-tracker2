import React from "react";
import type { ChecklistRendererProps } from "../types";
import FieldDisplay from "./FieldDisplay";
import ImageFieldSlot from "./ImageFieldSlot";
import { isImagePath } from "../data/schema-runtime.ts";

const ChecklistRenderer: React.FC<ChecklistRendererProps> = ({ data, pathPrefix }) => {
  // Leaf array
  if (Array.isArray(data)) {
    return (
      <ul className="space-y-4">
        {data.map((leaf, idx) => {
          const leafName = String(leaf);
          const path = `${pathPrefix}.${leafName}`;

          return (
            <li key={`${path}-${idx}`}>
              {isImagePath(path) ? (
                <ImageFieldSlot label={leafName} path={path} />
              ) : (
                <FieldDisplay path={path} label={leafName} />
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  // Nested object
  return (
    <div className="space-y-5">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="pl-3 border-l-2 border-slate-700/50">
          <h4 className="text-md font-semibold text-slate-300 mb-3">{key}</h4>
          <div className="pl-2">
            <ChecklistRenderer data={value as any} pathPrefix={`${pathPrefix}.${key}`} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ChecklistRenderer;
