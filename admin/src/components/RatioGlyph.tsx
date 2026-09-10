import * as React from "react";
import { ratioBox } from "../ratio";

/**
 * A ratio as a rectangle. See ratio.ts for why: ten checkboxes of numbers ask
 * for arithmetic in a tool whose subject is shape.
 */
const RatioGlyph = ({ ratio, max = 18 }: { ratio: string; max?: number }) => {
  const { width, height } = ratioBox(ratio, max);
  return (
    <span
      aria-hidden="true"
      title={ratio}
      style={{
        display: "inline-block",
        width,
        height,
        border: "1.5px solid currentColor",
        borderRadius: 2,
        verticalAlign: "middle",
      }}
    />
  );
};

export default RatioGlyph;
