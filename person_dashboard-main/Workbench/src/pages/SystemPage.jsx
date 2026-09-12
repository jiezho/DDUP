import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { getRuntimeStatus, refreshVault } from "../lib/api";
import { formatFullDate } from "../lib/format";
import { createBackup, ensureProjectSession, loadBackups, verifyBackup } from "../lib/projects-api";

export function SystemPage() {
  const [runtime, setRuntime] = useState({ data: null, source: "loading", error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [backups, setBackups] = useState({ status: "loading", spaceId: null, items: [], notice: "" });

  const loadRuntime = async () => {
    const response = await getRuntimeStatus();
    setRuntime(response);
  };

  useEffect(() => {
    let cancelled = false;
    getRuntimeStatus().then((response) => {
      if (!cancelled) setRuntime(response);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBackupState = async () => {
    try {
      const session = await ensureProjectSession();
      const spaceId = session.spaces?.[0]?.id;
      if (!spaceId) throw new Error("当前安装尚未建立可用空间。");
      const items = await loadBackups(spaceId);
      setBackups((current) => ({ ...current, status: "ready", spaceId, items }));
    } catch (error) {
      setBackups((current) => ({ ...current, status: "error", notice: error.message }));
    }
  };

  useEffect(() => { void loadBackupState(); }, []);

  const handleCreateBackup = async () => {
    if (!backups.spaceId) return;
    setBackups((current) => ({ ...current, status: "busy", notice: "" }));
    try {
      await createBackup(backups.spaceId);
      await loadBackupState();
      setBackups((current) => ({ ...current, notice: "一致性备份已完成，并已校验数据库与来源文件摘要。" }));
    } catch (error) {
      setBackups((current) => ({ ...current, status: "ready", notice: error.message }));
    }
  };

  const handleVerifyBackup = async (backupId) => {
    setBackups((current) => ({ ...current, status: "busy", notice: "" }));
    try {
      const result = await verifyBackup(backupId, backups.spaceId);
      setBackups((current) => ({ ...current, status: "ready", notice: result.state === "verified" ? "备份完整性校验通过。" : "备份完整性校验失败，请勿用于恢复。" }));
    } catch (error) {
      setBackups((current) => ({ ...current, status: "ready", notice: error.message }));
    }
  };

  const isLoading = runtime.source === "loading";
  const vault = runtime.data?.vault;
  const sync = runtime.data?.sync;
  const codex = runtime.data?.codex;
  const vaultConnected = vault?.connected === true;
  const vaultHasErrors = (vault?.errors ?? 0) > 0;
  const codexAvailable = codex?.available === true;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshVault();
      await loadRuntime();
    } catch (error) {
      console.error("刷新失败:", error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="page page--system">
      <PageHeader
        eyebrow="SYSTEM"
        title="系统状态"
        description="检查本地 Vault 索引与 Codex 运行时连接状态"
      />

      <div className="system-grid">
        {/* Vault Index Panel */}
        <div className="panel">
          <div className="panel__head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                className={`status-dot ${
                  isLoading
                    ? ""
                    : vaultConnected && !vaultHasErrors
                      ? "status-dot--ok"
                      : "status-dot--warn"
                }`}
              />
              <h2 className="panel__title">Vault 索引</h2>
            </div>
          </div>

          <div>
            <div className="system-kv">
              <dt>标签</dt>
              <dd>{vault?.label || "本地 Vault"}</dd>
            </div>
            <div className="system-kv">
              <dt>文档数</dt>
              <dd>{isLoading ? "—" : vault?.documents ?? "—"}</dd>
            </div>
            <div className="system-kv">
              <dt>索引时间</dt>
              <dd>{formatFullDate(vault?.generatedAt)}</dd>
            </div>
            <div className="system-kv">
              <dt>错误数</dt>
              <dd>{isLoading ? "—" : vault?.errors ?? "—"}</dd>
            </div>
            <div className="system-kv">
              <dt>文件同步</dt>
              <dd>{isLoading ? "—" : sync?.status || "—"}</dd>
            </div>
            <div className="system-kv">
              <dt>索引版本</dt>
              <dd>{isLoading ? "—" : sync?.indexVersion ?? "—"}</dd>
            </div>
          </div>

          <button
            type="button"
            className="graph-filter"
            onClick={handleRefresh}
            disabled={refreshing || !vaultConnected}
            style={{ marginTop: "16px", width: "100%" }}
          >
            {refreshing ? "重建中…" : "重建索引"}
          </button>
        </div>

        {/* Codex Runtime Panel */}
        <div className="panel">
          <div className="panel__head">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                className={`status-dot ${
                  isLoading ? "" : codexAvailable ? "status-dot--ok" : ""
                }`}
              />
              <h2 className="panel__title">Codex 运行时</h2>
            </div>
          </div>

          <div>
            <div className="system-kv">
              <dt>可用性</dt>
              <dd>
                {isLoading
                  ? "检测中"
                  : codexAvailable
                    ? "可用"
                    : "不可用"}
              </dd>
            </div>
            <div className="system-kv">
              <dt>来源</dt>
              <dd>{isLoading ? "—" : codex?.source || "—"}</dd>
            </div>
          </div>
        </div>
      </div>

      {/* Data boundary note */}
      <div className="panel" style={{ marginTop: "20px" }}>
        <p className="provenance">
          工作台通过本地文件事件自动更新 Vault 索引；数据缺失显示为 —，不做估算。
        </p>
      </div>

      <section className="panel system-backups" aria-labelledby="system-backups-title" style={{ marginTop: "20px" }}>
        <div className="panel__head"><div><h2 className="panel__title" id="system-backups-title">本地备份与恢复</h2><p>备份包含 SQLite 真源和受控来源文件，生成后立即做摘要校验。</p></div><button className="graph-filter" disabled={backups.status !== "ready"} onClick={handleCreateBackup} type="button">创建一致性备份</button></div>
        {backups.notice ? <p aria-live="polite" className="provenance">{backups.notice}</p> : null}
        {backups.status === "loading" ? <p className="provenance">正在读取本地备份…</p> : null}
        {backups.status === "ready" && !backups.items.length ? <p className="provenance">尚无备份。缺失保持缺失。</p> : null}
        <div className="system-backup-list">{backups.items.map((backup) => <article key={backup.backup_id}><div><strong>{formatFullDate(backup.created_at)}</strong><small>{backup.backup_id} · {backup.file_count} 个受控文件</small></div><button className="graph-filter" disabled={backups.status === "busy"} onClick={() => handleVerifyBackup(backup.backup_id)} type="button">重新校验</button></article>)}</div>
        <p className="provenance">恢复只允许在工作台停止时写入一个空目录，防止覆盖正在使用的数据。运维入口：<code>npm run backup:restore -- --backup &lt;备份目录&gt; --destination &lt;空目录&gt;</code>。</p>
      </section>
    </div>
  );
}
