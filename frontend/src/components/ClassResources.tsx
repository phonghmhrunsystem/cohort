import { useCallback, useEffect, useState, type FormEvent } from "react";

import { classResourcePath, downloadClassResource, request } from "../lib/api";
import { ApiFailure } from "../lib/errors";
import type { ClassResource, FieldErrors } from "../types";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { EmptyState } from "./EmptyState";
import { Field, Textarea } from "./Field";
import { DownloadIcon, EditIcon, IconButton, TrashIcon } from "./IconButton";
import { Spinner } from "./Spinner";
import { useToast } from "./Toast";

const token = () => sessionStorage.getItem("access_token") ?? undefined;

const UPLOAD_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip";

/** Kích cỡ cho người đọc, không phải cho máy: một chữ số thập phân là đủ để biết
 * mình sắp tải cái gì về. */
function formatBytes(size: number | null): string {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(1)} ${units[unit]}`;
}

type Draft = { title: string; description: string; url: string; file: File | null; kind: "link" | "file" };

const emptyDraft = (): Draft => ({ title: "", description: "", url: "", file: null, kind: "link" });

const draftFrom = (resource: ClassResource): Draft => ({
  title: resource.title,
  description: resource.description,
  url: resource.kind === "link" ? resource.url : "",
  file: null,
  kind: resource.kind,
});

/** Link gửi JSON, file gửi multipart. Sửa mà không chọn tệp mới thì không gửi
 * trường file — backend giữ nguyên tệp cũ (07 §3). */
function payloadOf(draft: Draft): unknown {
  if (draft.kind === "link") return { title: draft.title, description: draft.description, url: draft.url };
  const form = new FormData();
  form.append("title", draft.title);
  form.append("description", draft.description);
  if (draft.file) form.append("file", draft.file);
  return form;
}

function ResourceFields({ idPrefix, draft, errors, onChange, currentFilename }: {
  idPrefix: string;
  draft: Draft;
  errors: FieldErrors;
  onChange: (draft: Draft) => void;
  currentFilename?: string;
}) {
  return <>
    <div className="field field-full resource-kind" role="group" aria-label="Loại tài liệu">
      <label><input type="radio" name={`${idPrefix}-kind`} checked={draft.kind === "link"} onChange={() => onChange({ ...draft, kind: "link", file: null })} /> Liên kết</label>
      <label><input type="radio" name={`${idPrefix}-kind`} checked={draft.kind === "file"} onChange={() => onChange({ ...draft, kind: "file", url: "" })} /> Tệp tin</label>
    </div>
    <Field id={`${idPrefix}-title`} label="Title" required wide value={draft.title} error={errors.title?.[0]}
      onChange={(event) => onChange({ ...draft, title: event.target.value })} />
    <Textarea id={`${idPrefix}-description`} label="Description" wide rows={3} value={draft.description} error={errors.description?.[0]}
      onChange={(event) => onChange({ ...draft, description: event.target.value })} />
    {draft.kind === "link"
      ? <Field id={`${idPrefix}-url`} label="URL" required wide value={draft.url} error={errors.url?.[0]}
        onChange={(event) => onChange({ ...draft, url: event.target.value })} />
      : <Field id={`${idPrefix}-file`} label="Tệp tin" type="file" wide accept={UPLOAD_ACCEPT}
        error={errors.file?.[0] ?? errors.non_field_errors?.[0]}
        hint={currentFilename ? `Đang dùng ${currentFilename}. Bỏ trống để giữ nguyên.` : "Tối đa 25 MB · PDF, Word, PowerPoint, Excel, TXT, ZIP"}
        onChange={(event) => onChange({ ...draft, file: event.currentTarget.files?.[0] ?? null })} />}
  </>;
}

/** Hiển thị dùng chung cho tab Student và tab Teacher (07 §2.2, §2.3).
 * `manage` bật form tạo và nút sửa/xoá — Student không bao giờ thấy chúng.
 * `reloadKey` để màn hình nhúng ép nạp lại. */
export function ClassResources({ classId, reloadKey = 0, manage = false }: { classId: number; reloadKey?: number; manage?: boolean }) {
  const toast = useToast();
  const [resources, setResources] = useState<ClassResource[]>();
  const [failure, setFailure] = useState("");
  const [reload, setReload] = useState(0);

  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft);
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState<number>();
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [deleting, setDeleting] = useState<ClassResource>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFailure("");
    request<ClassResource[]>(`/classes/${classId}/resources`, { token: token() })
      .then((value) => value && setResources(value))
      .catch(() => { setFailure("Không tải được tài liệu."); setResources([]); });
  }, [classId, reloadKey, reload]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  const showError = (error: unknown, apply: (fields: FieldErrors) => void, fallback: string) => {
    if (error instanceof ApiFailure && error.fields) apply(error.fields);
    else toast.error(error instanceof Error ? error.message : fallback);
  };

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setCreateErrors({});
    setBusy(true);
    try {
      /** Resource cố ý không theo lifecycle của assignment: không kiểm is_open,
       * không hạn — đăng tài liệu cho lớp đã kết thúc là chuyện bình thường (07 §2.3). */
      await request(`/classes/${classId}/resources`, { method: "POST", token: token(), body: payloadOf(createDraft) });
      setCreateDraft(emptyDraft());
      refresh();
    } catch (error) {
      showError(error, setCreateErrors, "Unable to add resource.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(event: FormEvent, resource: ClassResource) {
    event.preventDefault();
    setEditErrors({});
    setBusy(true);
    try {
      await request(classResourcePath(classId, resource.id), { method: "PATCH", token: token(), body: payloadOf(editDraft) });
      setEditing(undefined);
      refresh();
    } catch (error) {
      showError(error, setEditErrors, "Unable to update resource.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await request(classResourcePath(classId, deleting.id), { method: "DELETE", token: token() });
      setDeleting(undefined);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete resource.");
    } finally {
      setBusy(false);
    }
  }

  const download = (resource: ClassResource) =>
    downloadClassResource(classId, resource).catch(() => toast.error("Không tải được tệp."));

  const list = () => {
    if (failure) return <Alert>{failure}</Alert>;
    if (!resources) return <Spinner label="Loading resources" />;
    if (resources.length === 0) return <EmptyState>Chưa có tài liệu nào.</EmptyState>;
    return <ul className="resource-list">
      {resources.map((resource) => <li key={resource.id}>
        {editing === resource.id
          ? <form noValidate className="form-grid" onSubmit={(event) => submitEdit(event, resource)}>
            <ResourceFields idPrefix={`resource-${resource.id}`} draft={editDraft} errors={editErrors} onChange={setEditDraft}
              currentFilename={resource.kind === "file" ? resource.original_filename : undefined} />
            <div className="form-actions field-full">
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Lưu"}</Button>
              <Button type="button" className="button-secondary" onClick={() => setEditing(undefined)}>Huỷ</Button>
            </div>
          </form>
          : <div className="resource-row">
            <div className="resource-main">
              {resource.kind === "link"
                /* URL do giáo viên tự nhập, lưu nguyên văn, không fetch/preview (07 §6). */
                ? <a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a>
                : <button type="button" className="resource-download" onClick={() => download(resource)}>
                  <DownloadIcon />{resource.title}
                </button>}
              {resource.description && <p className="muted">{resource.description}</p>}
              {resource.kind === "file" && <p className="muted resource-meta">{resource.original_filename} · {formatBytes(resource.size)}</p>}
            </div>
            {manage && <div className="row-actions">
              <IconButton icon={<EditIcon />} label="Sửa" onClick={() => { setEditErrors({}); setEditDraft(draftFrom(resource)); setEditing(resource.id); }} />
              <IconButton icon={<TrashIcon />} label="Xoá" variant="danger" onClick={() => setDeleting(resource)} />
            </div>}
          </div>}
      </li>)}
    </ul>;
  };

  return <>
    {manage && <form noValidate className="form-grid" onSubmit={submitCreate}>
      <ResourceFields idPrefix="resource" draft={createDraft} errors={createErrors} onChange={setCreateDraft} />
      <div className="form-actions field-full"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Tạo tài liệu"}</Button></div>
    </form>}
    {list()}
    {/* Xoá gỡ luôn tệp khỏi đĩa nên không để nó là một cú nhấp lỡ tay (07 §2.3). */}
    <Dialog open={Boolean(deleting)} onClose={() => setDeleting(undefined)} title="Xoá tài liệu">
      <p>Xoá “{deleting?.title}”? Thao tác này không hoàn tác được.</p>
      <div className="form-actions">
        <Button type="button" className="button-danger" disabled={busy} onClick={confirmDelete}>Xoá</Button>
        <Button type="button" className="button-secondary" onClick={() => setDeleting(undefined)}>Huỷ</Button>
      </div>
    </Dialog>
  </>;
}
