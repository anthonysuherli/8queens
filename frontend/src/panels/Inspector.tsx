/**
 * Inspector (Bloom/Kumu pattern): select on canvas → read AND write here.
 * Node: label / type / properties / evidence.  Edge: relation (via
 * delete+recreate — the contract has no edge PATCH) / endpoints / evidence.
 * Multi-select: bulk property set + bulk delete.
 */

import { useEffect, useState } from "react";
import { typeColor } from "../graph/colors";
import { graph } from "../graph/graphStore";
import { knownTypes } from "../state/derive";
import {
  bulkSetProperty,
  deleteElements,
  renameNode,
  replaceEdge,
  setNodeProperties,
  setNodeType,
} from "../state/mutations";
import { useStore } from "../state/store";

export function Inspector() {
  const selectedNodes = useStore((s) => s.selectedNodes);
  const selectedEdges = useStore((s) => s.selectedEdges);
  const graphVersion = useStore((s) => s.graphVersion);
  void graphVersion;

  const nodes = selectedNodes.filter((id) => graph.hasNode(id));
  const edges = selectedEdges.filter((id) => graph.hasEdge(id));
  const total = nodes.length + edges.length;

  return (
    <aside className="ins">
      <div className="ins-scroll">
        {total === 0 && <EmptyState />}
        {total === 1 && nodes.length === 1 && <NodeInspector key={nodes[0]} id={nodes[0]} />}
        {total === 1 && edges.length === 1 && <EdgeInspector key={edges[0]} id={edges[0]} />}
        {total > 1 && <BulkInspector nodes={nodes} edges={edges} />}
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="ins-empty">
      <h3>Inspector</h3>
      <p>Select a node or edge on the canvas to inspect and edit it. Shift-click for multi-select.</p>
      <div className="ins-keys">
        <div className="ins-key-row">
          <span className="kbd">T</span> travel mode
        </div>
        <div className="ins-key-row">
          <span className="kbd">E</span> connect from selected node
        </div>
        <div className="ins-key-row">
          <span className="kbd">Del</span> delete selection (undo-able)
        </div>
        <div className="ins-key-row">
          <span className="kbd">⌘Z</span> undo · <span className="kbd">⌘⇧Z</span> redo
        </div>
        <div className="ins-key-row">
          <span className="kbd">/</span> search labels
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function NodeInspector({ id }: { id: string }) {
  const startConnect = useStore((s) => s.startConnect);
  const openConcept = useStore((s) => s.openConcept);
  const schema = useStore((s) => s.schema);
  const attrs = graph.getNodeAttributes(id);

  const [label, setLabel] = useState(attrs.label);
  useEffect(() => setLabel(attrs.label), [attrs.label]);

  const commitLabel = () => {
    const next = label.trim();
    if (next && next !== attrs.label) void renameNode(id, next);
    else setLabel(attrs.label);
  };

  return (
    <>
      <div className="ins-header">
        <span className="type-dot" style={{ background: typeColor(attrs.nodeType) }} />
        <span className="ins-kind">Node</span>
        <span className="ins-id mono" title={id}>
          {id}
        </span>
      </div>

      <div className="sect">
        <div className="ins-row">
          <label>label</label>
          <input
            className="inp ins-label-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setLabel(attrs.label);
            }}
          />
        </div>
        <div className="ins-row">
          <label>type</label>
          <TypeSelect
            value={attrs.nodeType}
            options={knownTypes(schema?.intent, schema?.emergent)}
            onChange={(type) => void setNodeType(id, type)}
          />
        </div>
        <div className="ins-row">
          <label>created</label>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>
            {attrs.created_at ? new Date(attrs.created_at).toLocaleString() : "—"}
          </span>
        </div>
      </div>

      <div className="sect">
        <h2 className="sect-title">
          Properties <span className="sect-aux">{Object.keys(attrs.properties).length}</span>
        </h2>
        <PropertiesEditor
          properties={attrs.properties}
          onCommit={(next, action) => void setNodeProperties(id, next, action)}
        />
      </div>

      <div className="sect">
        <h2 className="sect-title">
          Evidence <span className="sect-aux">{attrs.grounded_in.length} finding(s)</span>
        </h2>
        <EvidenceList ids={attrs.grounded_in} />
      </div>

      <div className="ins-actions">
        <button className="btn" onClick={() => openConcept(id)}>
          read <span className="kbd">R</span>
        </button>
        <button className="btn" onClick={() => startConnect(id)}>
          ⌁ connect <span className="kbd">E</span>
        </button>
        <button
          className="btn btn--danger"
          style={{ marginLeft: "auto" }}
          onClick={() => void deleteElements([id], [])}
        >
          ✕ delete
        </button>
      </div>
    </>
  );
}

function TypeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (type: string) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  const all = options.includes(value) ? options : [...options, value].sort();

  if (custom) {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <input
          className="inp"
          autoFocus
          placeholder="new type name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange(draft.trim().toLowerCase());
              setCustom(false);
              setDraft("");
            }
            if (e.key === "Escape") setCustom(false);
          }}
        />
        <button className="btn" onClick={() => setCustom(false)}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      className="inp"
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") setCustom(true);
        else onChange(e.target.value);
      }}
    >
      {all.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
      <option value="__new__">+ new type…</option>
    </select>
  );
}

// ---------------------------------------------------------------------------

function EdgeInspector({ id }: { id: string }) {
  const attrs = graph.getEdgeAttributes(id);
  const source = graph.source(id);
  const target = graph.target(id);

  const [relation, setRelation] = useState(attrs.relation);
  useEffect(() => setRelation(attrs.relation), [attrs.relation]);

  const commitRelation = () => {
    const next = relation.trim();
    if (next && next !== attrs.relation) void replaceEdge(id, { relation: next });
    else setRelation(attrs.relation);
  };

  return (
    <>
      <div className="ins-header">
        <span className="type-dot" style={{ background: "var(--accent)" }} />
        <span className="ins-kind">Edge</span>
        <span className="ins-id mono" title={id}>
          {id}
        </span>
      </div>

      <div className="sect">
        <div className="ins-row">
          <label>relation</label>
          <input
            className="inp"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            onBlur={commitRelation}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRelation(attrs.relation);
            }}
          />
        </div>
        <EndpointButton role="from" id={source} />
        <EndpointButton role="to" id={target} />
      </div>

      <div className="sect">
        <h2 className="sect-title">
          Properties <span className="sect-aux">{Object.keys(attrs.properties).length}</span>
        </h2>
        <PropertiesEditor
          properties={attrs.properties}
          onCommit={(next) => void replaceEdge(id, { properties: next })}
        />
      </div>

      <div className="sect">
        <h2 className="sect-title">
          Evidence <span className="sect-aux">{attrs.grounded_in.length} finding(s)</span>
        </h2>
        <EvidenceList ids={attrs.grounded_in} />
      </div>

      <div className="ins-actions">
        <button
          className="btn btn--danger"
          style={{ marginLeft: "auto" }}
          onClick={() => void deleteElements([], [id])}
        >
          ✕ delete
        </button>
      </div>
    </>
  );
}

function EndpointButton({ role, id }: { role: string; id: string }) {
  const selectNode = useStore((s) => s.selectNode);
  const requestFly = useStore((s) => s.requestFly);
  if (!graph.hasNode(id)) return null;
  const attrs = graph.getNodeAttributes(id);
  return (
    <div className="ins-row">
      <label>{role}</label>
      <button
        className="ins-endpoint"
        onClick={() => {
          selectNode(id);
          requestFly(id);
        }}
      >
        <span className="type-dot" style={{ background: typeColor(attrs.nodeType) }} />
        {attrs.label}
        <span className="arrow" style={{ marginLeft: "auto" }}>
          ↗
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BulkInspector({ nodes, edges }: { nodes: string[]; edges: string[] }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const apply = () => {
    if (!key.trim() || nodes.length === 0) return;
    void bulkSetProperty(nodes, key.trim(), parseValue(value));
    setKey("");
    setValue("");
  };

  return (
    <>
      <div className="ins-header">
        <span className="ins-kind">Multi-select</span>
      </div>
      <div className="sect">
        <div className="ins-bulk-count">
          {nodes.length > 0 && `${nodes.length} node(s)`}
          {nodes.length > 0 && edges.length > 0 && " · "}
          {edges.length > 0 && `${edges.length} edge(s)`}
        </div>
        <p style={{ color: "var(--text-faint)", fontSize: 11 }}>
          Shift-click to add or remove elements from the selection.
        </p>
      </div>
      {nodes.length > 0 && (
        <div className="sect">
          <h2 className="sect-title">Set property on all nodes</h2>
          <div className="ins-bulk-form">
            <input className="inp" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
            <input
              className="inp"
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <button className="btn" onClick={apply} disabled={!key.trim()}>
              apply
            </button>
          </div>
        </div>
      )}
      <div className="ins-actions">
        <button
          className="btn btn--danger"
          style={{ marginLeft: "auto" }}
          onClick={() => void deleteElements(nodes, edges)}
        >
          ✕ delete all ({nodes.length + edges.length})
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// shared: properties editor + evidence list

export function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function displayValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function PropertiesEditor({
  properties,
  onCommit,
}: {
  properties: Record<string, unknown>;
  onCommit: (next: Record<string, unknown>, action: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const entries = Object.entries(properties);

  const commitValue = (key: string, raw: string) => {
    const parsed = parseValue(raw);
    if (displayValue(parsed) === displayValue(properties[key])) return;
    onCommit({ ...properties, [key]: parsed }, `set ${key}`);
  };

  const renameKey = (oldKey: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldKey) return;
    const next: Record<string, unknown> = {};
    for (const [k, v] of entries) next[k === oldKey ? trimmed : k] = v;
    onCommit(next, `rename property ${oldKey} → ${trimmed}`);
  };

  const removeKey = (key: string) => {
    const next = { ...properties };
    delete next[key];
    onCommit(next, `remove property ${key}`);
  };

  const add = () => {
    const k = newKey.trim();
    if (!k) return;
    onCommit({ ...properties, [k]: parseValue(newValue) }, `add property ${k}`);
    setNewKey("");
    setNewValue("");
  };

  return (
    <div className="ins-props">
      {entries.map(([key, value]) => (
        <div className="ins-prop-row" key={key}>
          <input
            className="inp"
            defaultValue={key}
            onBlur={(e) => renameKey(key, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <input
            className="inp"
            defaultValue={displayValue(value)}
            onBlur={(e) => commitValue(key, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <button className="ins-prop-del" title={`remove ${key}`} onClick={() => removeKey(key)}>
            ✕
          </button>
        </div>
      ))}
      {entries.length === 0 && <div className="placeholder">no properties</div>}
      <div className="ins-prop-row ins-prop-add">
        <input
          className="inp"
          placeholder="key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <input
          className="inp"
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="ins-prop-del" title="add property" onClick={add} style={{ color: "var(--green)" }}>
          +
        </button>
      </div>
    </div>
  );
}

export function EvidenceList({ ids }: { ids: string[] }) {
  const findingCache = useStore((s) => s.findingCache);
  const fetchFinding = useStore((s) => s.fetchFinding);
  const openFinding = useStore((s) => s.openFinding);

  useEffect(() => {
    ids.forEach(fetchFinding);
  }, [ids, fetchFinding]);

  if (ids.length === 0) {
    return <div className="placeholder">ungrounded — no evidence attached</div>;
  }

  return (
    <div>
      {ids.map((id) => {
        const entry = findingCache[id];
        if (!entry || entry.status === "loading") {
          return (
            <div key={id} className="ev-item">
              <div className="ev-meta">
                <span className="spin" /> loading {id}…
              </div>
            </div>
          );
        }
        if (entry.status === "error") {
          return (
            <div key={id} className="ev-item">
              <div className="ev-missing">finding {id} unavailable — {entry.message}</div>
            </div>
          );
        }
        const f = entry.data;
        const domains = [...new Set(f.provenance.map((p) => p.domain))];
        return (
          <button key={id} className="ev-item" onClick={() => openFinding(id)}>
            <div className="ev-title">{f.title}</div>
            <div className="ev-meta">
              <span className="ev-conf" title={`confidence ${f.confidence.toFixed(2)}`}>
                <i style={{ width: `${Math.round(f.confidence * 100)}%` }} />
              </span>
              {f.confidence.toFixed(2)}
              <span>{domains.join(" · ") || "no sources"}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
