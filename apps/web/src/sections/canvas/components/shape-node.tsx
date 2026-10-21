import { useCallback, useEffect, useRef } from "react";
import {
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { BanIcon, Minus, MoreHorizontal, RotateCwIcon, Trash2Icon } from "@/components/icons";
import type { MouseEvent as ReactMouseEvent } from "react";

import { ButtonGroup, ButtonGroupItem, ButtonGroupSeparator } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

import {
  canvasShapeDimensions,
  canvasColorOptions,
  canvasStrokeStyleOptions,
  canvasStrokeWidthOptions,
  getCanvasColorOption,
} from "../lib/constants";
import { ShapeSvg } from "./shape-svg";
import type {
  CanvasNode,
  CanvasNodeColorId,
  CanvasShapeNode,
  CanvasStrokeStyle,
  CanvasStrokeWidth,
} from "../lib/types";

export function ShapeNode({ data, height, id, selected, width }: NodeProps<CanvasShapeNode>) {
  const { deleteElements, setNodes } = useReactFlow<CanvasNode>();
  const colorOption = getCanvasColorOption(data.color);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const rotationSessionRef = useRef<{
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);

  const updateNode = useCallback(
    (
      nextState: Partial<{
        color: CanvasNodeColorId;
        rotation: number;
        strokeStyle: CanvasStrokeStyle;
        strokeWidth: CanvasStrokeWidth;
      }>,
    ) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id && node.type === "shape"
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...nextState,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const session = rotationSessionRef.current;

      if (!session) {
        return;
      }

      const currentAngle = Math.atan2(
        event.clientY - session.centerY,
        event.clientX - session.centerX,
      );
      const nextRotation =
        session.startRotation + ((currentAngle - session.startAngle) * 180) / Math.PI;

      updateNode({ rotation: normalizeRotation(nextRotation) });
    };

    const onMouseUp = () => {
      rotationSessionRef.current = null;
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
    };
  }, [updateNode]);

  const startRotating = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = nodeRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    rotationSessionRef.current = {
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      startRotation: data.rotation,
    };
    document.body.style.cursor = "grabbing";
  };

  return (
    <>
      <NodeToolbar isVisible={selected} offset={40} position={Position.Top}>
        <ButtonGroup aria-label="Shape actions" variant="floating">
          <ButtonGroupItem
            layout="icon"
            aria-label="Use default shape color"
            className={cn(data.color === "default" && "bg-action-neutral-hover")}
            onClick={() => updateNode({ color: "default" })}
            type="button"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-content-primary">
              <BanIcon className="size-4" />
            </span>
          </ButtonGroupItem>
          {canvasColorOptions
            .filter((option) => option.id !== "default")
            .map((option) => (
              <ButtonGroupItem
                layout="icon"
                aria-label={`Use ${option.label.toLowerCase()} shape color`}
                className={cn(data.color === option.id && "bg-action-neutral-hover")}
                key={option.id}
                onClick={() => updateNode({ color: option.id })}
                type="button"
              >
                <span
                  className="h-6 w-6 rounded-full border"
                  style={{
                    background: option.fill,
                    borderColor: option.stroke,
                  }}
                />
              </ButtonGroupItem>
            ))}
          <ButtonGroupSeparator />
          {canvasStrokeWidthOptions.map((option) => (
            <ButtonGroupItem
              layout="icon"
              aria-label={`Use ${option.label.toLowerCase()} stroke`}
              className={cn(data.strokeWidth === option.value && "bg-action-neutral-hover")}
              key={option.value}
              onClick={() => updateNode({ strokeWidth: option.value })}
              type="button"
            >
              <span
                className="block w-4 rounded-full bg-content-primary"
                style={{ height: Math.max(2, option.value - 1) }}
              />
            </ButtonGroupItem>
          ))}
          <ButtonGroupSeparator />
          {canvasStrokeStyleOptions.map((option) => (
            <ButtonGroupItem
              layout="icon"
              aria-label={`Use ${option.label.toLowerCase()} stroke style`}
              className={cn(data.strokeStyle === option.value && "bg-action-neutral-hover")}
              key={option.value}
              onClick={() => updateNode({ strokeStyle: option.value })}
              type="button"
            >
              <StrokeStyleIcon style={option.value} />
            </ButtonGroupItem>
          ))}
          <ButtonGroupSeparator />
          <ButtonGroupItem
            layout="icon"
            aria-label="Delete shape"
            onClick={() => void deleteElements({ nodes: [{ id }] })}
            type="button"
          >
            <Trash2Icon className="size-4" />
          </ButtonGroupItem>
        </ButtonGroup>
      </NodeToolbar>
      <div className="relative h-full w-full" ref={nodeRef}>
        <div
          className="absolute inset-0 origin-center"
          style={{
            transform: `rotate(${data.rotation}deg)`,
          }}
        >
          <Handle
            className="pointer-events-none !left-1/2 !top-1/2 !h-px !w-px !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent"
            id="shape-target"
            isConnectable={false}
            position={Position.Top}
            type="target"
          />
          <Handle
            className="pointer-events-none !left-1/2 !top-1/2 !h-px !w-px !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent"
            id="shape-source"
            isConnectable={false}
            position={Position.Bottom}
            type="source"
          />
          <NodeResizer
            color="var(--zb-color-content-text-primary)"
            handleStyle={{
              background: "var(--zb-color-surface-background-canvas)",
              border: "2px solid var(--zb-color-content-text-primary)",
              borderRadius: 0,
              height: 12,
              width: 12,
            }}
            isVisible={selected}
            lineStyle={{
              borderColor: "var(--zb-color-content-text-primary)",
              borderWidth: 1,
            }}
            minHeight={Math.max(52, Math.round(canvasShapeDimensions[data.shape].height * 0.6))}
            minWidth={Math.max(52, Math.round(canvasShapeDimensions[data.shape].width * 0.6))}
          />
          {selected ? (
            <button
              aria-label="Rotate shape"
              className="nodrag absolute bottom-0 left-1/2 z-20 flex h-7 w-7 -translate-x-1/2 translate-y-[calc(100%+0.5rem)] cursor-grab items-center justify-center rounded-full border border-stroke-default bg-surface-canvas text-content-primary shadow-sm"
              onMouseDown={startRotating}
              type="button"
            >
              <RotateCwIcon className="size-3.5" />
            </button>
          ) : null}
          <div className="h-full w-full">
            <ShapeSvg
              fill={colorOption.fill}
              height={height ?? 100}
              seed={data.seed}
              shape={data.shape}
              stroke={colorOption.stroke}
              strokeStyle={data.strokeStyle}
              strokeWidth={data.strokeWidth}
              width={width ?? 100}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function normalizeRotation(rotation: number) {
  const normalized = rotation % 360;

  return normalized < 0 ? normalized + 360 : normalized;
}

function StrokeStyleIcon({ style }: { style: CanvasStrokeStyle }) {
  if (style === "dotted") {
    return <MoreHorizontal aria-hidden="true" className="size-4" />;
  }

  if (style === "dashed") {
    return (
      <span aria-hidden="true" className="inline-flex size-4 items-center">
        <Minus className="size-2" />
        <Minus className="size-2" />
      </span>
    );
  }

  return <Minus aria-hidden="true" className="size-4" />;
}
