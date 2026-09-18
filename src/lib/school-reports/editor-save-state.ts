import { designStatesEqual, type SchoolReportDesignSettings } from './design';
import { editorStatesEqual, type SchoolReportEditorState } from './editor-state';

export type EditorSaveSnapshot = { editor: SchoolReportEditorState; design: SchoolReportDesignSettings };

/** A response acknowledges only the content sent, not edits made while waiting. */
export function hasUnsavedReportChanges(current: EditorSaveSnapshot, saved: EditorSaveSnapshot): boolean {
  return !editorStatesEqual(current.editor, saved.editor) || !designStatesEqual(current.design, saved.design);
}
