import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import { javascriptGenerator } from 'blockly/javascript';

interface BlocklyEditorProps {
  xml?: string;
  onChange: (xml: string, code: string) => void;
  language?: string;
}

export default function BlocklyEditor({ xml, onChange, language = 'python' }: BlocklyEditorProps) {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const initialXmlApplied = useRef(false);

  useEffect(() => {
    if (!blocklyDiv.current) return;

    // Toolbox definition
    const toolbox = {
      kind: 'categoryToolbox',
      contents: [
        {
          kind: 'category',
          name: 'Logic',
          colour: '#5b80a5',
          contents: [
            { kind: 'block', type: 'controls_if' },
            { kind: 'block', type: 'logic_compare' },
            { kind: 'block', type: 'logic_operation' },
            { kind: 'block', type: 'logic_negate' },
            { kind: 'block', type: 'logic_boolean' },
          ],
        },
        {
          kind: 'category',
          name: 'Loops',
          colour: '#5ba55b',
          contents: [
            { kind: 'block', type: 'controls_repeat_ext' },
            { kind: 'block', type: 'controls_whileUntil' },
            { kind: 'block', type: 'controls_for' },
            { kind: 'block', type: 'controls_forEach' },
            { kind: 'block', type: 'controls_flow_statements' },
          ],
        },
        {
          kind: 'category',
          name: 'Math',
          colour: '#5b67a5',
          contents: [
            { kind: 'block', type: 'math_number' },
            { kind: 'block', type: 'math_arithmetic' },
            { kind: 'block', type: 'math_single' },
            { kind: 'block', type: 'math_trig' },
            { kind: 'block', type: 'math_constant' },
            { kind: 'block', type: 'math_number_property' },
            { kind: 'block', type: 'math_round' },
            { kind: 'block', type: 'math_on_list' },
            { kind: 'block', type: 'math_modulo' },
            { kind: 'block', type: 'math_constrain' },
            { kind: 'block', type: 'math_random_int' },
            { kind: 'block', type: 'math_random_float' },
          ],
        },
        {
          kind: 'category',
          name: 'Text',
          colour: '#5ba58c',
          contents: [
            { kind: 'block', type: 'text' },
            { kind: 'block', type: 'text_join' },
            { kind: 'block', type: 'text_append' },
            { kind: 'block', type: 'text_length' },
            { kind: 'block', type: 'text_isEmpty' },
            { kind: 'block', type: 'text_indexOf' },
            { kind: 'block', type: 'text_charAt' },
            { kind: 'block', type: 'text_getSubstring' },
            { kind: 'block', type: 'text_changeCase' },
            { kind: 'block', type: 'text_trim' },
            { kind: 'block', type: 'text_print' },
            { kind: 'block', type: 'text_prompt_ext' },
          ],
        },
        {
          kind: 'category',
          name: 'Variables',
          colour: '#a55b80',
          custom: 'VARIABLE',
        },
        {
          kind: 'category',
          name: 'Functions',
          colour: '#995ba5',
          custom: 'PROCEDURE',
        },
      ],
    };

    const workspace = Blockly.inject(blocklyDiv.current, {
      toolbox,
      theme: Blockly.Theme.defineTheme('rillcod-dark', {
        'base': Blockly.Themes.Classic,
        'componentStyles': {
          'workspaceBackgroundColour': '#0d1526',
          'toolboxBackgroundColour': '#161625',
          'toolboxForegroundColour': '#ffffff',
          'flyoutBackgroundColour': '#1e293b',
          'flyoutForegroundColour': '#cccccc',
          'scrollbarColour': '#334155',
          'insertionMarkerColour': '#fff',
          'insertionMarkerOpacity': 0.3,
          'scrollbarOpacity': 0.4,
          'cursorColour': '#d1d5db'
        }
      } as any),
      grid: { spacing: 15, length: 2, colour: '#1e293b', snap: true },
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
      toolboxPosition: 'right',
    });

    workspaceRef.current = workspace;

    const onWorkspaceChange = () => {
      const xmlDom = Blockly.Xml.workspaceToDom(workspace);
      const xmlText = Blockly.Xml.domToText(xmlDom);
      let generatedCode = '';
      
      try {
        if (language === 'python' || language === 'robotics') {
          generatedCode = pythonGenerator.workspaceToCode(workspace);
        } else if (language === 'javascript') {
          generatedCode = javascriptGenerator.workspaceToCode(workspace);
        } else {
          generatedCode = javascriptGenerator.workspaceToCode(workspace);
        }
      } catch (e) {
        console.error('Code generation error:', e);
      }
      
      onChange(xmlText, generatedCode);
    };

    workspace.addChangeListener(onWorkspaceChange);

    // Initial load
    if (xml && !initialXmlApplied.current) {
      try {
        const dom = Blockly.utils.xml.textToDom(xml);
        Blockly.Xml.domToWorkspace(dom, workspace);
        initialXmlApplied.current = true;
      } catch (e) {
        console.error('Failed to load blocks XML', e);
      }
    }

    return () => {
      workspace.dispose();
    };
  }, []); // Only once

  // Update XML if it changes from outside (e.g. project load)
  useEffect(() => {
    if (workspaceRef.current && xml && initialXmlApplied.current) {
      const currentXml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current));
      if (currentXml !== xml) {
        workspaceRef.current.clear();
        try {
          const dom = Blockly.utils.xml.textToDom(xml);
          Blockly.Xml.domToWorkspace(dom, workspaceRef.current);
        } catch (e) {
          console.error('Failed to update blocks XML', e);
        }
      }
    }
  }, [xml]);

  return (
    <div className="w-full h-full relative border-t border-border bg-[#0d1526]">
       <div ref={blocklyDiv} className="absolute inset-0" />
    </div>
  );
}
