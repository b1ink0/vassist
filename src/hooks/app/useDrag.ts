import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useDrag = () =>
  useAppStore(
    useShallow((state) => ({
      isDraggingButton: state.isDraggingButton,
      isDraggingModel: state.isDraggingModel,
      isDragOverChat: state.isDragOverChat,
      buttonPosition: state.buttonPosition,
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
