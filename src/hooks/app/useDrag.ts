import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useIsDraggingButton = () =>
  useAppStore((state) => state.isDraggingButton);

export const useIsDraggingModel = () =>
  useAppStore((state) => state.isDraggingModel);

export const useIsDragOverChat = () =>
  useAppStore((state) => state.isDragOverChat);

export const useButtonPosition = () =>
  useAppStore((state) => state.buttonPosition);

export const useDragActions = () =>
  useAppStore(
    useShallow((state) => ({
      setIsDraggingButton: state.setIsDraggingButton,
      setIsDraggingModel: state.setIsDraggingModel,
      setIsDragOverChat: state.setIsDragOverChat,
      setButtonPosition: state.setButtonPosition,
      startButtonDrag: state.startButtonDrag,
      endButtonDrag: state.endButtonDrag,
      startModelDrag: state.startModelDrag,
      endModelDrag: state.endModelDrag,
      updateButtonPosition: state.updateButtonPosition,
    })),
  );
