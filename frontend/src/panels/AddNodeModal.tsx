/**
 * "Extend" entry point: add a node (label, type, optional properties).
 */

import { useState } from "react";
import { knownTypes } from "../state/derive";
import { addNode } from "../state/mutations";
import { useStore } from "../state/store";
import { parseValue } from "./Inspector";

interface DraftProp {
  key: string;
  value: string;
}

export function AddNodeModal() {
  const open = useStore((s) => s.addNodeOpen);
  const setOpen = useStore((s) => s.setAddNodeOpen);
  const schema = useStore((s) => s.schema);

  const [label, setLabel] = useState("");
  const [type, setType] = useState("concept");
  const [customType, setCustomType] = useState("");
  const [props, setProps] = useState<DraftProp[]>([]);

  if (!open) return null;
  const types = knownTypes(schema?.intent, schema?.emergent);

  const close = () => {
    setOpen(false);
    setLabel("");
    setProps([]);
    setCustomType("");
  };

  const create = async () => {
    const finalLabel = label.trim();
    const finalType = (type === "__new__" ? customType : type).trim().toLowerCase();
    if (!finalLabel || !finalType) return;
    const properties: Record<string, unknown> = {};
    for (const p of props) {
      if (p.key.trim()) properties[p.key.trim()] = parseValue(p.value);
    }
    close();
    await addNode({
      label: finalLabel,
      type: finalType,
      properties: Object.keys(properties).length ? properties : undefined,
    });
  };

  return (
    <div className="modal-veil" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">Add node</div>
        <div className="modal-body">
          <div className="modal-row">
            <label>label</label>
            <input
              className="inp ins-label-input"
              autoFocus
              placeholder="what is it called?"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
            />
          </div>
          <div className="modal-row">
            <label>type</label>
            <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__new__">+ new type…</option>
            </select>
            {type === "__new__" && (
              <input
                className="inp"
                placeholder="new type name"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
              />
            )}
          </div>
          <div className="modal-row">
            <label>properties (optional)</label>
            {props.map((p, i) => (
              <div key={i} className="ins-prop-row">
                <input
                  className="inp"
                  placeholder="key"
                  value={p.key}
                  onChange={(e) =>
                    setProps(props.map((q, j) => (j === i ? { ...q, key: e.target.value } : q)))
                  }
                />
                <input
                  className="inp"
                  placeholder="value"
                  value={p.value}
                  onChange={(e) =>
                    setProps(props.map((q, j) => (j === i ? { ...q, value: e.target.value } : q)))
                  }
                />
                <button className="ins-prop-del" onClick={() => setProps(props.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn btn--ghost"
              style={{ justifySelf: "start" }}
              onClick={() => setProps([...props, { key: "", value: "" }])}
            >
              + property
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            cancel
          </button>
          <button className="btn btn--accent" onClick={() => void create()} disabled={!label.trim()}>
            create node
          </button>
        </div>
      </div>
    </div>
  );
}
