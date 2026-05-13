import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  List,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  theme
} from "antd";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  downloadHermesStorageObject,
  deleteHermesStorageObject,
  getHermesFeedbackSummary,
  getHermesBlueprint,
  getHermesInstanceDetail,
  getHermesInstances,
  getHermesOverview,
  getHermesRuntime,
  getHermesStorageObjects,
  getHermesSkills,
  presignHermesStorageObject,
  registerHermesInstance,
  saveHermesArchive,
  saveHermesMemory,
  searchHermesLibrary,
  uploadHermesStorageObject,
  writeHermesWikiRaw,
  type HermesRuntimeStatus,
  type HermesBlueprint,
  type HermesFeedbackSummary,
  type HermesInstanceDetail,
  type HermesInstanceListItem,
  type HermesOverview,
  type HermesSearchResponse,
  type HermesStorageListResponse,
  type HermesStoragePresignOut,
  type HermesSkillsResponse
} from "../lib/hermes";

const coverageLabelMap: Record<string, string> = {
  registry_present: "实例注册表",
  skills_manifest_present: "技能清单",
  outputs_index_present: "产出索引",
  shared_memory_present: "共享记忆",
  wiki_raw_present: "Wiki 原始区"
};

const statusColorMap: Record<string, string> = {
  active: "success",
  partial: "warning",
  planned: "processing",
  inactive: "default",
  unknown: "default"
};

const priorityColorMap: Record<string, string> = {
  P0: "red",
  P1: "gold",
  P2: "blue"
};

const taskStatusColorMap: Record<string, string> = {
  open: "default",
  in_progress: "processing",
  done: "success"
};

const feedbackLevelColorMap: Record<string, string> = {
  error: "red",
  warning: "gold",
  info: "blue",
  success: "green"
};

const jobStatusColorMap: Record<string, string> = {
  healthy: "success",
  failing: "error",
  pending_archive: "processing",
  stale: "warning",
  paused: "default"
};

const lifecycleStatusColorMap: Record<string, string> = {
  healthy: "success",
  pending: "processing",
  degraded: "warning",
  missing: "error"
};

type RegisterFormValues = {
  id: string;
  name: string;
  deployment_type: string;
  host: string;
  hermes_version: string;
  specialization?: string;
  platforms?: string[];
  toolsets?: string[];
};

type MemoryFormValues = {
  instance_id: string;
  scope: "self" | "shared";
  key: string;
  content: string;
};

type WikiFormValues = {
  instance_id: string;
  title: string;
  content: string;
  tags?: string;
};

type ArchiveFormValues = {
  instance_id: string;
  job_id: string;
  title: string;
  summary: string;
  content: string;
  metadata?: string;
};

type StoragePresignFormValues = {
  key: string;
  expires_days: number;
};

const searchSourceOptions = [
  { value: "instance", label: "实例" },
  { value: "skill", label: "技能" },
  { value: "memory", label: "记忆" },
  { value: "output", label: "产出" },
  { value: "wiki", label: "Wiki" },
  { value: "cron", label: "归档" }
];

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace("T", " ").replace("+00:00", " UTC");
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;
  return `${size >= 10 || exponent === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[exponent]}`;
}

function formatDurationMs(value: number | null | undefined) {
  if (!value || value <= 0) return "-";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

export default function HermesAdminPage() {
  const [overview, setOverview] = useState<HermesOverview | null>(null);
  const [blueprint, setBlueprint] = useState<HermesBlueprint | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<HermesFeedbackSummary | null>(null);
  const [instances, setInstances] = useState<HermesInstanceListItem[]>([]);
  const [skills, setSkills] = useState<HermesSkillsResponse | null>(null);
  const [runtime, setRuntime] = useState<HermesRuntimeStatus | null>(null);
  const [storageResult, setStorageResult] = useState<HermesStorageListResponse | null>(null);
  const [presignResult, setPresignResult] = useState<HermesStoragePresignOut | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [instanceDetail, setInstanceDetail] = useState<HermesInstanceDetail | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchSources, setSearchSources] = useState<string[]>([]);
  const [searchInstanceId, setSearchInstanceId] = useState<string | null>(null);
  const [storageInstanceId, setStorageInstanceId] = useState<string | null>(null);
  const [storagePrefix, setStoragePrefix] = useState("");
  const [storageUploadCategory, setStorageUploadCategory] = useState("assets");
  const [storageUploadFile, setStorageUploadFile] = useState<File | null>(null);
  const [searchResult, setSearchResult] = useState<HermesSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token } = theme.useToken();
  const [messageApi, contextHolder] = message.useMessage();
  const [registerForm] = Form.useForm<RegisterFormValues>();
  const [memoryForm] = Form.useForm<MemoryFormValues>();
  const [wikiForm] = Form.useForm<WikiFormValues>();
  const [archiveForm] = Form.useForm<ArchiveFormValues>();
  const [storageForm] = Form.useForm<StoragePresignFormValues>();

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResp, blueprintResp, feedbackResp, instancesResp, skillsResp, runtimeResp] = await Promise.all([
        getHermesOverview(),
        getHermesBlueprint(),
        getHermesFeedbackSummary(),
        getHermesInstances(),
        getHermesSkills(),
        getHermesRuntime()
      ]);
      setOverview(overviewResp);
      setBlueprint(blueprintResp);
      setFeedbackSummary(feedbackResp);
      setInstances(instancesResp.items);
      setSkills(skillsResp);
      setRuntime(runtimeResp);

      const defaultId = selectedInstanceId || instancesResp.items[0]?.id || null;
      setSelectedInstanceId(defaultId);
      setStorageInstanceId((current) => current ?? defaultId);
      if (defaultId) {
        setInstanceDetail(await getHermesInstanceDetail(defaultId));
      } else {
        setInstanceDetail(null);
      }
    } catch {
      setError("Hermes 管理数据加载失败，请检查后端治理接口与共享库目录状态。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll().catch(() => null);
  }, []);

  const loadInstanceDetail = async (instanceId: string) => {
    setSelectedInstanceId(instanceId);
    setInstanceDetail(await getHermesInstanceDetail(instanceId));
  };

  const onSearch = async () => {
    const keyword = searchText.trim();
    if (!keyword) {
      setSearchResult(null);
      return;
    }
    setSearching(true);
    try {
      setSearchResult(
        await searchHermesLibrary({
          query: keyword,
          sources: searchSources,
          instanceId: searchInstanceId,
          limit: 12
        })
      );
    } finally {
      setSearching(false);
    }
  };

  const loadStorageObjects = async () => {
    setStorageLoading(true);
    try {
      setStorageResult(
        await getHermesStorageObjects({
          instanceId: storageInstanceId,
          prefix: storagePrefix.trim() || null,
          limit: 12
        })
      );
    } finally {
      setStorageLoading(false);
    }
  };

  const submitRegister = async (values: RegisterFormValues) => {
    setSubmittingAction(true);
    try {
      await registerHermesInstance({
        id: values.id.trim(),
        name: values.name.trim(),
        deployment_type: values.deployment_type,
        host: values.host.trim(),
        hermes_version: values.hermes_version.trim(),
        specialization: values.specialization?.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) || [],
        platforms: values.platforms || [],
        toolsets: values.toolsets || []
      });
      messageApi.success("实例已注册，注册表与目录骨架已同步更新。");
      registerForm.resetFields();
      await loadAll();
    } catch {
      messageApi.error("实例注册失败，请检查实例 ID 是否重复或目录写权限。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const submitMemory = async (values: MemoryFormValues) => {
    setSubmittingAction(true);
    try {
      await saveHermesMemory(values);
      messageApi.success("记忆条目已写入。");
      memoryForm.resetFields();
      await loadAll();
    } catch {
      messageApi.error("写入记忆失败，请检查实例 ID 和共享库写权限。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const submitWiki = async (values: WikiFormValues) => {
    setSubmittingAction(true);
    try {
      await writeHermesWikiRaw({
        instance_id: values.instance_id,
        title: values.title,
        content: values.content,
        tags: values.tags?.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) || []
      });
      messageApi.success("Wiki 原始稿已写入。");
      wikiForm.resetFields();
      await loadAll();
    } catch {
      messageApi.error("写入 Wiki 原始稿失败，请检查目录结构与写权限。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const submitArchive = async (values: ArchiveFormValues) => {
    setSubmittingAction(true);
    try {
      await saveHermesArchive({
        instance_id: values.instance_id,
        job_id: values.job_id,
        title: values.title,
        summary: values.summary,
        content: values.content,
        metadata: values.metadata?.trim() ? (JSON.parse(values.metadata) as Record<string, unknown>) : {}
      });
      messageApi.success("归档已写入，outputs 索引已更新。");
      archiveForm.resetFields();
      await loadAll();
    } catch {
      messageApi.error("归档写入失败，请检查任务归属、实例 ID 或 metadata JSON 格式。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const submitStoragePresign = async (values: StoragePresignFormValues) => {
    setSubmittingAction(true);
    try {
      const result = await presignHermesStorageObject({
        key: values.key.trim(),
        expires_days: values.expires_days
      });
      setPresignResult(result);
      if (result.status === "success") {
        messageApi.success("预签名链接已生成。");
      } else {
        messageApi.error(result.message || "预签名失败，请检查对象 key 或存储配置。");
      }
      storageForm.setFieldsValue({
        key: result.key,
        expires_days: values.expires_days
      });
    } catch {
      setPresignResult(null);
      messageApi.error("预签名失败，请检查对象 key 或存储配置。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const quickPresignStorageObject = async (key: string) => {
    const expiresDays = storageForm.getFieldValue("expires_days") || 7;
    storageForm.setFieldsValue({ key, expires_days: expiresDays });
    await submitStoragePresign({ key, expires_days: expiresDays });
  };

  const submitStorageUpload = async () => {
    if (!storageUploadFile) {
      messageApi.warning("请先选择一个本地文件。");
      return;
    }
    setSubmittingAction(true);
    try {
      const result = await uploadHermesStorageObject({
        file: storageUploadFile,
        instanceId: storageInstanceId,
        category: storageUploadCategory
      });
      if (result.status === "success") {
        setPresignResult(null);
        setStorageUploadFile(null);
        messageApi.success("对象已上传到存储。");
        await loadStorageObjects();
      } else {
        messageApi.error(result.message || "上传失败，请检查对象存储配置。");
      }
    } catch {
      messageApi.error("上传失败，请检查对象存储配置。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const submitStorageDelete = async (key: string) => {
    setSubmittingAction(true);
    try {
      const result = await deleteHermesStorageObject({
        key,
        instance_id: storageInstanceId
      });
      if (result.status === "success") {
        messageApi.success("对象已删除。");
        if (presignResult?.key === key) {
          setPresignResult(null);
        }
        await loadStorageObjects();
      } else {
        messageApi.error(result.message || "删除失败，请检查对象命名空间或存储配置。");
      }
    } catch {
      messageApi.error("删除失败，请检查对象命名空间或存储配置。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const submitStorageDownload = async (key: string) => {
    setSubmittingAction(true);
    try {
      await downloadHermesStorageObject({
        key,
        instance_id: storageInstanceId
      });
      messageApi.success("下载已开始。");
    } catch {
      messageApi.error("下载失败，请检查对象命名空间或存储配置。");
    } finally {
      setSubmittingAction(false);
    }
  };

  const instanceColumns = useMemo(
    () => [
      {
        title: "实例",
        dataIndex: "name",
        key: "name",
        render: (_: unknown, record: HermesInstanceListItem) => (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{record.name}</Typography.Text>
            <Typography.Text type="secondary">{record.id}</Typography.Text>
          </Space>
        )
      },
      {
        title: "部署",
        key: "deployment",
        render: (_: unknown, record: HermesInstanceListItem) => (
          <Space wrap>
            <Tag>{record.deployment.type}</Tag>
            <Tag>{record.deployment.host_label}</Tag>
            <Tag>{record.deployment.hermes_version}</Tag>
          </Space>
        )
      },
      {
        title: "能力数",
        key: "capabilities",
        render: (_: unknown, record: HermesInstanceListItem) => record.capabilities.declared_count
      },
      {
        title: "记忆文件",
        key: "memory",
        render: (_: unknown, record: HermesInstanceListItem) => record.memory.files_count
      },
      {
        title: "产出索引",
        key: "outputs",
        render: (_: unknown, record: HermesInstanceListItem) => record.outputs.entries_count
      },
      {
        title: "状态",
        key: "status",
        render: (_: unknown, record: HermesInstanceListItem) => (
          <Tag color={statusColorMap[record.status] || "default"}>{record.status}</Tag>
        )
      }
    ],
    []
  );

  const shellStyle = {
    width: "100%",
    borderRadius: 28,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorBgContainer,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)"
  } as const;

  const tonalStyle = {
    borderRadius: 28,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: `linear-gradient(180deg, ${token.colorBgContainer} 0%, ${token.colorFillTertiary} 100%)`,
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)"
  } as const;

  const statStyle = {
    borderRadius: 24,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorFillTertiary,
    boxShadow: "none"
  } as const;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      {contextHolder}
      <Card bordered={false} style={tonalStyle} bodyStyle={{ padding: 28 }}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Space wrap align="center" style={{ justifyContent: "space-between", width: "100%" }}>
            <Space direction="vertical" size={4}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                Hermes 管理台
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
                统一查看多 Hermes 实例、共享技能、记忆覆盖与方案蓝图。当前页面已经从纯只读巡检升级到轻操作治理，
                可直接完成实例注册、记忆写入与 Wiki 原始稿录入。
              </Typography.Paragraph>
            </Space>
            <Typography.Text type="secondary">多实例协同</Typography.Text>
          </Space>
          <Space wrap>
            <Button type="primary" onClick={() => loadAll().catch(() => null)} loading={loading}>
              刷新数据
            </Button>
            <Typography.Text type="secondary" style={{ maxWidth: 720 }}>
              当前聚焦：{overview?.current_focus?.join(" / ") || "正在加载治理建议"}
            </Typography.Text>
          </Space>
        </Space>
      </Card>

      {error ? <Alert type="error" showIcon message="加载失败" description={error} /> : null}

      <Row gutter={[16, 16]}>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="实例总数" value={overview?.instances_count ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="活跃实例" value={overview?.active_instances_count ?? overview?.online_instances_count ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="已发布技能" value={overview?.skills_count ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="共享记忆文件" value={overview?.shared_memory_files_count ?? 0} loading={loading} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="Wiki 原始稿" value={overview?.runtime?.wiki_raw_files_count ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="Wiki 编译稿" value={overview?.runtime?.wiki_compiled_files_count ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="归档文件" value={overview?.runtime?.cron_archive_files_count ?? 0} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} md={12} xl={6}>
          <Card bordered={false} style={statStyle}>
            <Statistic title="记忆命名空间" value={overview?.runtime?.memory_namespaces_count ?? 0} loading={loading} />
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message="当前说明"
        description="当前页面已接入 Hermes 最小可用动作接口，并补齐归档写入、对象存储浏览与预签名入口；Wiki 编译与任务反馈面板仍属于下一步产品化范围。"
        style={{ borderRadius: 20 }}
      />

      <Card title="轻操作入口" bordered={false} style={shellStyle}>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={6}>
            <Form form={registerForm} layout="vertical" onFinish={(values) => submitRegister(values).catch(() => null)}>
              <Form.Item label="实例 ID" name="id" rules={[{ required: true, message: "请输入实例 ID" }]}>
                <Input placeholder="例如 hermes-ops" />
              </Form.Item>
              <Form.Item label="实例名称" name="name" rules={[{ required: true, message: "请输入实例名称" }]}>
                <Input placeholder="例如 Hermes Ops" />
              </Form.Item>
              <Form.Item label="部署类型" name="deployment_type" initialValue="docker">
                <Select options={[{ value: "docker", label: "docker" }, { value: "server", label: "server" }, { value: "lxc", label: "lxc" }]} />
              </Form.Item>
              <Form.Item label="主机标识" name="host" initialValue="localhost">
                <Input />
              </Form.Item>
              <Form.Item label="Hermes 版本" name="hermes_version" initialValue="unknown">
                <Input />
              </Form.Item>
              <Form.Item label="平台" name="platforms">
                <Select mode="tags" placeholder="feishu / telegram / weixin" />
              </Form.Item>
              <Form.Item label="工具集" name="toolsets">
                <Select mode="tags" placeholder="terminal / web / memory" />
              </Form.Item>
              <Form.Item label="专长" name="specialization">
                <Input.TextArea rows={3} placeholder="逗号或换行分隔" />
              </Form.Item>
              <Button htmlType="submit" type="primary" loading={submittingAction}>
                注册实例
              </Button>
            </Form>
          </Col>
          <Col xs={24} xl={6}>
            <Form form={memoryForm} layout="vertical" initialValues={{ scope: "self" }} onFinish={(values) => submitMemory(values).catch(() => null)}>
              <Form.Item label="目标实例" name="instance_id" rules={[{ required: true, message: "请选择实例" }]}>
                <Select options={instances.map((item) => ({ value: item.id, label: `${item.name} (${item.id})` }))} />
              </Form.Item>
              <Form.Item label="写入范围" name="scope" rules={[{ required: true, message: "请选择范围" }]}>
                <Select options={[{ value: "self", label: "实例私有" }, { value: "shared", label: "共享记忆" }]} />
              </Form.Item>
              <Form.Item label="记忆键" name="key" rules={[{ required: true, message: "请输入记忆键" }]}>
                <Input placeholder="例如 巡检上下文" />
              </Form.Item>
              <Form.Item label="内容" name="content" rules={[{ required: true, message: "请输入内容" }]}>
                <Input.TextArea rows={8} placeholder="写入 memory-ext 的内容" />
              </Form.Item>
              <Button htmlType="submit" type="primary" loading={submittingAction}>
                写入记忆
              </Button>
            </Form>
          </Col>
          <Col xs={24} xl={6}>
            <Form form={wikiForm} layout="vertical" onFinish={(values) => submitWiki(values).catch(() => null)}>
              <Form.Item label="目标实例" name="instance_id" rules={[{ required: true, message: "请选择实例" }]}>
                <Select options={instances.map((item) => ({ value: item.id, label: `${item.name} (${item.id})` }))} />
              </Form.Item>
              <Form.Item label="标题" name="title" rules={[{ required: true, message: "请输入标题" }]}>
                <Input placeholder="例如 每周运维摘要" />
              </Form.Item>
              <Form.Item label="标签" name="tags">
                <Input placeholder="逗号分隔，例如 ops,deploy" />
              </Form.Item>
              <Form.Item label="正文" name="content" rules={[{ required: true, message: "请输入正文" }]}>
                <Input.TextArea rows={8} placeholder="写入 wiki/_raw/{instance-id} 的内容" />
              </Form.Item>
              <Button htmlType="submit" type="primary" loading={submittingAction}>
                写入 Wiki 原始稿
              </Button>
            </Form>
          </Col>
          <Col xs={24} xl={6}>
            <Form form={archiveForm} layout="vertical" onFinish={(values) => submitArchive(values).catch(() => null)}>
              <Form.Item label="目标实例" name="instance_id" rules={[{ required: true, message: "请选择实例" }]}>
                <Select options={instances.map((item) => ({ value: item.id, label: `${item.name} (${item.id})` }))} />
              </Form.Item>
              <Form.Item label="任务 ID" name="job_id" rules={[{ required: true, message: "请输入任务 ID" }]}>
                <Input placeholder="例如 paper-scout-daily" />
              </Form.Item>
              <Form.Item label="标题" name="title" rules={[{ required: true, message: "请输入标题" }]}>
                <Input placeholder="例如 Paper Scout Daily" />
              </Form.Item>
              <Form.Item label="摘要" name="summary" rules={[{ required: true, message: "请输入摘要" }]}>
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item label="内容" name="content" rules={[{ required: true, message: "请输入归档正文" }]}>
                <Input.TextArea rows={4} />
              </Form.Item>
              <Form.Item label="元数据 JSON" name="metadata">
                <Input.TextArea rows={2} placeholder='例如 {"papers_count": 5}' />
              </Form.Item>
              <Button htmlType="submit" type="primary" loading={submittingAction}>
                写入归档
              </Button>
            </Form>
          </Col>
        </Row>
      </Card>

      <Card title="运行状态" bordered={false} style={shellStyle}>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={8}>
            <Card size="small" title="Cron 注册表">
              <List
                size="small"
                dataSource={[
                  `注册表：${runtime?.cron.registry_present ? "已就绪" : "缺失"}`,
                  `任务总数：${runtime?.cron.jobs_total ?? 0}`,
                  `活跃任务：${runtime?.cron.active_jobs ?? 0}`,
                  `实例归属：${(runtime?.cron.owners || []).join(" / ") || "-"}`
                ]}
                renderItem={(item: string) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Col>
          <Col xs={24} xl={8}>
            <Card size="small" title="对象存储">
              <List
                size="small"
                dataSource={[
                  `策略文件：${runtime?.storage.policy_present ? "已就绪" : "缺失"}`,
                  `Bucket：${runtime?.storage.bucket || "-"}`,
                  `凭证：${runtime?.storage.credentials_present ? "已配置" : "未配置"}`,
                  `探测：${runtime?.storage.probe?.status || "-"}`
                ]}
                renderItem={(item: string) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Col>
          <Col xs={24} xl={8}>
            <Card size="small" title="最近归档">
              <List
                size="small"
                locale={{ emptyText: "暂无归档记录" }}
                dataSource={runtime?.archives.recent_entries || []}
                renderItem={(item: HermesRuntimeStatus["archives"]["recent_entries"][number]) => (
                  <List.Item>
                    <List.Item.Meta
                      title={`${item.title || item.job_id || item.id} ${item.instance_id ? `(${item.instance_id})` : ""}`}
                      description={`${formatTime(item.archived_at)} | ${item.file_path || "-"}`}
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card size="small" title="生命周期任务">
              <List
                size="small"
                locale={{ emptyText: "暂无生命周期任务" }}
                dataSource={runtime?.lifecycle_tasks || []}
                renderItem={(item: HermesRuntimeStatus["lifecycle_tasks"][number]) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <Tag color="blue">{item.stage}</Tag>
                          <Typography.Text strong>{item.title}</Typography.Text>
                          <Tag color={lifecycleStatusColorMap[item.status] || "default"}>{item.status}</Tag>
                        </Space>
                      }
                      description={item.detail}
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card size="small" title="隔离与脱敏规则">
              <List
                size="small"
                dataSource={[
                  `规则文件：${runtime?.isolation.present ? "已加载" : "缺失"}`,
                  `规则数量：${runtime?.isolation.rules_count ?? 0}`,
                  `执行级别：${runtime?.isolation.enforcement_level || "-"}`,
                  `违规阻断：${runtime?.isolation.block_on_violation ? "开启" : "关闭"}`,
                  `违规审计：${runtime?.isolation.audit_violations ? "开启" : "关闭"}`,
                  `他实例记忆摘要：${runtime?.isolation.shared_memory_cross_read ? "允许摘要只读" : "关闭"}`,
                  `对象存储跨实例读：${runtime?.isolation.storage_cross_read ? "允许" : "关闭"}`,
                  `编译 Wiki 只读：${runtime?.isolation.compiled_wiki_readonly ? "是" : "否"}`
                ]}
                renderItem={(item: string) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Tabs
        items={[
          {
            key: "instances",
            label: "实例总览",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={16}>
                <Card title="实例清单" extra={<Typography.Text type="secondary">{instances.length} 个实例</Typography.Text>} bordered={false} style={shellStyle}>
                  <Table
                    rowKey="id"
                    loading={loading}
                    dataSource={instances}
                    columns={instanceColumns}
                    pagination={false}
                    onRow={(record) => ({ onClick: () => loadInstanceDetail(record.id).catch(() => null) })}
                  />
                </Card>
                <Card title="实例详情" extra={selectedInstanceId ? <Typography.Text type="secondary">{selectedInstanceId}</Typography.Text> : null} bordered={false} style={shellStyle}>
                  {!instanceDetail ? (
                    <Typography.Text type="secondary">请选择一个实例查看详情。</Typography.Text>
                  ) : (
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                      <Descriptions bordered column={2} size="small">
                        <Descriptions.Item label="实例名称">{instanceDetail.name}</Descriptions.Item>
                        <Descriptions.Item label="运行状态">
                          <Typography.Text strong>{instanceDetail.status}</Typography.Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="部署类型">{instanceDetail.deployment.type}</Descriptions.Item>
                        <Descriptions.Item label="Hermes 版本">{instanceDetail.deployment.hermes_version}</Descriptions.Item>
                        <Descriptions.Item label="主机标识">{instanceDetail.deployment.host_label}</Descriptions.Item>
                        <Descriptions.Item label="数据目录就绪">{instanceDetail.deployment.data_path_present ? "是" : "否"}</Descriptions.Item>
                        <Descriptions.Item label="记忆最近更新">{formatTime(instanceDetail.memory.latest_updated_at)}</Descriptions.Item>
                        <Descriptions.Item label="产出索引数">{instanceDetail.outputs.entries_count}</Descriptions.Item>
                      </Descriptions>
                      <Space wrap>
                        {instanceDetail.capabilities.summary_tags.length ? (
                          instanceDetail.capabilities.summary_tags.map((item) => <Tag key={item}>{item}</Tag>)
                        ) : (
                          <Tag>未声明能力</Tag>
                        )}
                      </Space>
                      <Space wrap>
                        {instanceDetail.specialization.length ? (
                          instanceDetail.specialization.map((item) => (
                            <Tag color="purple" key={item}>
                              {item}
                            </Tag>
                          ))
                        ) : (
                          <Tag color="default">未声明专长</Tag>
                        )}
                      </Space>
                      <Row gutter={[16, 16]}>
                        <Col xs={24} xl={12}>
                          <Card size="small" title="最近记忆文件">
                            <List
                              size="small"
                              dataSource={instanceDetail.memory.recent_files}
                              locale={{ emptyText: "暂无记忆文件" }}
                              renderItem={(item: HermesInstanceDetail["memory"]["recent_files"][number]) => (
                                <List.Item>
                                  <List.Item.Meta title={item.name} description={`${item.relative_path} | ${formatTime(item.updated_at)}`} />
                                </List.Item>
                              )}
                            />
                          </Card>
                        </Col>
                        <Col xs={24} xl={12}>
                          <Card size="small" title="生命周期负载">
                            <List
                              size="small"
                              dataSource={[
                                `子智能体：${instanceDetail.sub_agents.length}`,
                                `定时任务：${instanceDetail.cron_jobs.length}`,
                                `已发布技能：${instanceDetail.published_skills.length}`
                              ]}
                              renderItem={(item: string) => <List.Item>{item}</List.Item>}
                            />
                          </Card>
                        </Col>
                        <Col xs={24}>
                          <Card size="small" title="能力契约">
                            <Descriptions column={2} size="small">
                              <Descriptions.Item label="模型">{instanceDetail.capabilities.model || "-"}</Descriptions.Item>
                              <Descriptions.Item label="上下文窗口">{instanceDetail.capabilities.context_window || "-"}</Descriptions.Item>
                              <Descriptions.Item label="已声明能力数">{instanceDetail.capabilities.declared_count}</Descriptions.Item>
                              <Descriptions.Item label="技能数">{instanceDetail.capabilities.skills_count ?? "-"}</Descriptions.Item>
                              <Descriptions.Item label="最大子代理">{instanceDetail.capabilities.max_subagents ?? "-"}</Descriptions.Item>
                              <Descriptions.Item label="Skill Hub">{instanceDetail.capabilities.skill_hub_available ?? "-"}</Descriptions.Item>
                            </Descriptions>
                            <Space wrap style={{ marginTop: 12 }}>
                              {instanceDetail.capabilities.platforms.map((item) => (
                                <Tag color="geekblue" key={`platform-${item}`}>
                                  {item}
                                </Tag>
                              ))}
                              {instanceDetail.capabilities.toolsets.map((item) => (
                                <Tag color="purple" key={`toolset-${item}`}>
                                  {item}
                                </Tag>
                              ))}
                            </Space>
                          </Card>
                        </Col>
                      </Row>
                    </Space>
                  )}
                </Card>
              </Space>
            )
          },
          {
            key: "blueprint",
            label: "方案蓝图",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={16}>
                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={12}>
                    <Card title="核心原则" bordered={false} style={shellStyle}>
                      <List
                        dataSource={blueprint?.principles || []}
                        locale={{ emptyText: "暂无原则数据" }}
                        renderItem={(item: HermesBlueprint["principles"][number]) => (
                          <List.Item>
                            <List.Item.Meta title={item.title} description={item.description} />
                          </List.Item>
                        )}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card title="生命周期策略" bordered={false} style={shellStyle}>
                      <List
                        dataSource={blueprint?.lifecycle || []}
                        locale={{ emptyText: "暂无生命周期数据" }}
                        renderItem={(item: HermesBlueprint["lifecycle"][number]) => (
                          <List.Item>
                            <List.Item.Meta title={item.stage} description={`${item.description}；检查点：${item.checkpoints.join(" / ")}`} />
                          </List.Item>
                        )}
                      />
                    </Card>
                  </Col>
                </Row>
                <Card title="共享库接口约束" bordered={false} style={shellStyle}>
                  <Table
                    rowKey="name"
                    dataSource={blueprint?.interfaces || []}
                    pagination={false}
                    columns={[
                      { title: "接口", dataIndex: "name", key: "name" },
                      { title: "层级", dataIndex: "scope", key: "scope" },
                      { title: "契约说明", dataIndex: "contract", key: "contract" },
                      {
                        title: "状态",
                        dataIndex: "status",
                        key: "status",
                        render: (value: string) => <Tag color={statusColorMap[value] || "default"}>{value}</Tag>
                      }
                    ]}
                  />
                </Card>
                <Card title="待办事项" bordered={false} style={shellStyle}>
                  <List
                    dataSource={blueprint?.pending_tasks || []}
                    locale={{ emptyText: "暂无待办事项" }}
                    renderItem={(item: HermesBlueprint["pending_tasks"][number]) => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space>
                              <Tag color={priorityColorMap[item.priority] || "default"}>{item.priority}</Tag>
                              {item.title}
                            </Space>
                          }
                          description={item.description}
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "feedback",
            label: "任务与反馈",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={16}>
                <Row gutter={[16, 16]}>
                  <Col xs={12} md={12} xl={6}>
                    <Card bordered={false} style={statStyle}>
                      <Statistic title="进行中任务" value={feedbackSummary?.metrics.in_progress_tasks ?? 0} loading={loading} />
                    </Card>
                  </Col>
                  <Col xs={12} md={12} xl={6}>
                    <Card bordered={false} style={statStyle}>
                      <Statistic title="未完成任务" value={feedbackSummary?.metrics.open_tasks ?? 0} loading={loading} />
                    </Card>
                  </Col>
                  <Col xs={12} md={12} xl={6}>
                    <Card bordered={false} style={statStyle}>
                      <Statistic title="最近动作" value={feedbackSummary?.metrics.recent_actions ?? 0} loading={loading} />
                    </Card>
                  </Col>
                  <Col xs={12} md={12} xl={6}>
                    <Card bordered={false} style={statStyle}>
                      <Statistic title="活跃实例" value={feedbackSummary?.metrics.active_instances ?? 0} loading={loading} />
                    </Card>
                  </Col>
                  <Col xs={12} md={12} xl={6}>
                    <Card bordered={false} style={statStyle}>
                      <Statistic title="运行作业" value={feedbackSummary?.metrics.operational_jobs ?? 0} loading={loading} />
                    </Card>
                  </Col>
                  <Col xs={12} md={12} xl={6}>
                    <Card bordered={false} style={statStyle}>
                      <Statistic title="陈旧作业" value={feedbackSummary?.metrics.stale_jobs ?? 0} loading={loading} />
                    </Card>
                  </Col>
                </Row>
                <Card title="当前聚焦" bordered={false} style={shellStyle}>
                  <List
                    locale={{ emptyText: "暂无聚焦项" }}
                    dataSource={feedbackSummary?.focus || []}
                    renderItem={(item: string) => <List.Item>{item}</List.Item>}
                  />
                </Card>
                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={12}>
                    <Card title="任务状态" bordered={false} style={shellStyle}>
                      <List
                        locale={{ emptyText: "暂无任务状态" }}
                        dataSource={feedbackSummary?.pending || []}
                        renderItem={(item: HermesFeedbackSummary["pending"][number]) => (
                          <List.Item>
                            <List.Item.Meta
                              title={
                                <Space wrap>
                                  <Tag color={priorityColorMap[item.priority] || "default"}>{item.priority}</Tag>
                                  <Tag color={taskStatusColorMap[item.status] || "default"}>{item.status}</Tag>
                                  <span>{item.title}</span>
                                </Space>
                              }
                              description={item.description}
                            />
                          </List.Item>
                        )}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card title="审计反馈" bordered={false} style={shellStyle}>
                      <List
                        locale={{ emptyText: "暂无审计反馈" }}
                        dataSource={feedbackSummary?.feedback || []}
                        renderItem={(item: HermesFeedbackSummary["feedback"][number]) => (
                          <List.Item>
                            <List.Item.Meta
                              title={
                                <Space wrap>
                                  <Tag color={feedbackLevelColorMap[item.level] || "default"}>{item.level}</Tag>
                                  <span>{item.title}</span>
                                </Space>
                              }
                              description={item.description}
                            />
                          </List.Item>
                        )}
                      />
                    </Card>
                  </Col>
                </Row>
                <Card title="最近 Hermes 动作" bordered={false} style={shellStyle}>
                  <List
                    locale={{ emptyText: "暂无 Hermes 审计动作" }}
                    dataSource={feedbackSummary?.recent_actions || []}
                    renderItem={(item: HermesFeedbackSummary["recent_actions"][number]) => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space wrap>
                              <Tag>{item.action}</Tag>
                              {item.resource_type ? <Tag color="geekblue">{item.resource_type}</Tag> : null}
                              {item.resource_id ? <span>{item.resource_id}</span> : null}
                            </Space>
                          }
                          description={formatTime(item.created_at)}
                        />
                      </List.Item>
                    )}
                  />
                </Card>
                <Card title="运行作业状态" bordered={false} style={shellStyle}>
                  <List
                    locale={{ emptyText: "暂无可观测作业" }}
                    dataSource={feedbackSummary?.operational_jobs || []}
                    renderItem={(item: HermesFeedbackSummary["operational_jobs"][number]) => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space wrap>
                              <Tag color="geekblue">{item.owner}</Tag>
                              <Tag>{item.job_id}</Tag>
                              <Tag color={jobStatusColorMap[item.derived_status] || "default"}>{item.derived_status}</Tag>
                              <Tag>{item.configured_status}</Tag>
                              {item.last_execution_status ? <Tag color={item.last_execution_status === "success" ? "success" : "error"}>{item.last_execution_status}</Tag> : null}
                            </Space>
                          }
                          description={[
                            item.schedule,
                            `归档 ${item.archive_count} 次`,
                            `成功 ${item.success_count} 次`,
                            `失败 ${item.failure_count} 次`,
                            `最近成功 ${formatTime(item.last_success_at)}`,
                            `最近失败 ${formatTime(item.last_failure_at)}`,
                            `最近耗时 ${formatDurationMs(item.last_duration_ms)}`,
                            `最近归档 ${formatTime(item.last_archived_at)}`,
                            item.latest_title ? `最新标题 ${item.latest_title}` : null
                          ]
                            .filter(Boolean)
                            .join(" | ")}
                        />
                        {item.last_failure_summary || item.last_failure_message || item.last_failure_hint ? (
                          <Space direction="vertical" size={4} style={{ width: "100%", marginTop: 8 }}>
                            {item.last_failure_summary ? (
                              <Typography.Text type="danger">失败摘要：{item.last_failure_summary}</Typography.Text>
                            ) : null}
                            {item.last_failure_message ? (
                              <Typography.Text type="secondary">失败细节：{item.last_failure_message}</Typography.Text>
                            ) : null}
                            {item.last_failure_hint ? (
                              <Alert type="warning" showIcon message={item.last_failure_hint} />
                            ) : null}
                          </Space>
                        ) : null}
                      </List.Item>
                    )}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "skills",
            label: "技能与检索",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={16}>
                <Card title="已发布技能" extra={<Typography.Text type="secondary">{skills?.skills_count ?? 0} 项</Typography.Text>} bordered={false} style={shellStyle}>
                  <Table
                    rowKey="name"
                    pagination={false}
                    dataSource={skills?.skills || []}
                    columns={[
                      { title: "技能", dataIndex: "name", key: "name" },
                      { title: "作者", dataIndex: "author", key: "author" },
                      {
                        title: "优先级",
                        dataIndex: "priority",
                        key: "priority",
                        render: (value: string) => <Tag color={priorityColorMap[value] || "default"}>{value || "-"}</Tag>
                      },
                      {
                        title: "标签",
                        dataIndex: "tags",
                        key: "tags",
                        render: (value: string[]) => <Space wrap>{(value || []).map((item) => <Tag key={item}>{item}</Tag>)}</Space>
                      }
                    ]}
                  />
                </Card>
                <Card title="跨实例检索" bordered={false} style={shellStyle}>
                  <Space direction="vertical" style={{ width: "100%" }} size={12}>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={14}>
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="筛选来源"
                          options={searchSourceOptions}
                          value={searchSources}
                          onChange={setSearchSources}
                          style={{ width: "100%" }}
                        />
                      </Col>
                      <Col xs={24} md={10}>
                        <Select
                          allowClear
                          placeholder="限定实例"
                          value={searchInstanceId ?? undefined}
                          onChange={(value) => setSearchInstanceId(value ?? null)}
                          options={instances.map((item) => ({ value: item.id, label: `${item.name} (${item.id})` }))}
                          style={{ width: "100%" }}
                        />
                      </Col>
                    </Row>
                    <Input.Search
                      enterButton="搜索"
                      placeholder="检索实例、技能、memory-ext、Wiki 或归档内容"
                      value={searchText}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value)}
                      onSearch={() => onSearch().catch(() => null)}
                      loading={searching}
                    />
                    <List
                      locale={{ emptyText: searchText ? "没有匹配结果" : "输入关键词开始检索" }}
                      dataSource={searchResult?.items || []}
                      renderItem={(item: HermesSearchResponse["items"][number]) => (
                        <List.Item>
                          <List.Item.Meta
                            title={
                              <Space wrap>
                                <Tag>{item.source}</Tag>
                                <span>{item.title}</span>
                                {item.instance_id ? <Tag color="geekblue">{item.instance_id}</Tag> : null}
                                {item.access ? <Tag color="purple">{item.access}</Tag> : null}
                              </Space>
                            }
                            description={item.file_path ? `${item.snippet}\n${item.file_path}` : item.snippet}
                          />
                        </List.Item>
                      )}
                    />
                  </Space>
                </Card>
                <Card title="对象存储浏览与预签名" bordered={false} style={shellStyle}>
                  <Space direction="vertical" style={{ width: "100%" }} size={12}>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={8}>
                        <Select
                          allowClear
                          placeholder="按实例浏览"
                          value={storageInstanceId ?? undefined}
                          onChange={(value) => setStorageInstanceId(value ?? null)}
                          options={instances.map((item) => ({ value: item.id, label: `${item.name} (${item.id})` }))}
                          style={{ width: "100%" }}
                        />
                      </Col>
                      <Col xs={24} md={10}>
                        <Input
                          placeholder="或输入前缀，例如 hermes-research/papers/"
                          value={storagePrefix}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setStoragePrefix(event.target.value)}
                        />
                      </Col>
                      <Col xs={24} md={6}>
                        <Button type="primary" block onClick={() => loadStorageObjects().catch(() => null)} loading={storageLoading}>
                          浏览对象
                        </Button>
                      </Col>
                    </Row>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={8}>
                        <Select
                          value={storageUploadCategory}
                          onChange={setStorageUploadCategory}
                          options={[
                            { value: "assets", label: "assets" },
                            { value: "papers", label: "papers" },
                            { value: "archives", label: "archives" },
                            { value: "exports", label: "exports" }
                          ]}
                          style={{ width: "100%" }}
                        />
                      </Col>
                      <Col xs={24} md={10}>
                        <Input
                          type="file"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setStorageUploadFile(event.target.files?.[0] || null)}
                        />
                      </Col>
                      <Col xs={24} md={6}>
                        <Button type="primary" block onClick={() => submitStorageUpload().catch(() => null)} loading={submittingAction}>
                          上传对象
                        </Button>
                      </Col>
                    </Row>
                    {storageResult?.status === "error" ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="对象存储暂不可用"
                        description={storageResult.message || "请检查 MinIO 配置、凭证与网络连通性。"}
                      />
                    ) : null}
                    <List
                      locale={{ emptyText: storageResult ? "当前筛选下没有对象" : "选择实例或前缀后开始浏览对象" }}
                      dataSource={storageResult?.objects || []}
                      renderItem={(item: HermesStorageListResponse["objects"][number]) => (
                        <List.Item
                          actions={[
                            <Button
                              key={`download-${item.key}`}
                              type="link"
                              onClick={() => submitStorageDownload(item.key).catch(() => null)}
                              loading={submittingAction && presignResult?.key !== item.key && storageForm.getFieldValue("key") !== item.key}
                            >
                              下载
                            </Button>,
                            <Button
                              key={`presign-${item.key}`}
                              type="link"
                              onClick={() => quickPresignStorageObject(item.key).catch(() => null)}
                              loading={submittingAction && storageForm.getFieldValue("key") === item.key}
                            >
                              生成链接
                            </Button>,
                            <Button
                              key={`delete-${item.key}`}
                              type="link"
                              danger
                              onClick={() => submitStorageDelete(item.key).catch(() => null)}
                              loading={submittingAction && presignResult?.key !== item.key && storageForm.getFieldValue("key") !== item.key}
                            >
                              删除
                            </Button>
                          ]}
                        >
                          <List.Item.Meta
                            title={item.key}
                            description={`${formatBytes(item.size)} | ${formatTime(item.last_modified)}`}
                          />
                        </List.Item>
                      )}
                    />
                    <Form
                      form={storageForm}
                      layout="vertical"
                      initialValues={{ expires_days: 7 }}
                      onFinish={(values) => submitStoragePresign(values).catch(() => null)}
                    >
                      <Row gutter={[12, 0]}>
                        <Col xs={24} md={16}>
                          <Form.Item label="对象 Key" name="key" rules={[{ required: true, message: "请输入对象 key" }]}>
                            <Input placeholder="例如 hermes-research/papers/2026-05/a.pdf" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                          <Form.Item label="有效期" name="expires_days">
                            <Select
                              options={[
                                { value: 1, label: "1 天" },
                                { value: 3, label: "3 天" },
                                { value: 7, label: "7 天" },
                                { value: 14, label: "14 天" },
                                { value: 30, label: "30 天" }
                              ]}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                          <Form.Item label=" " colon={false}>
                            <Button htmlType="submit" type="primary" block loading={submittingAction}>
                              预签名
                            </Button>
                          </Form.Item>
                        </Col>
                      </Row>
                    </Form>
                    {presignResult ? (
                      <Card size="small" title="最近生成的预签名结果">
                        <Space direction="vertical" size={6} style={{ width: "100%" }}>
                          <Typography.Text strong>{presignResult.key}</Typography.Text>
                          <Typography.Text type="secondary">状态：{presignResult.status}</Typography.Text>
                          <Typography.Text type="secondary">有效期：{presignResult.expires_in || "-"}</Typography.Text>
                          {presignResult.url ? (
                            <Typography.Paragraph copyable={{ text: presignResult.url }} style={{ marginBottom: 0 }}>
                              {presignResult.url}
                            </Typography.Paragraph>
                          ) : (
                            <Typography.Text type="danger">{presignResult.message || "未返回可用链接"}</Typography.Text>
                          )}
                        </Space>
                      </Card>
                    ) : null}
                  </Space>
                </Card>
              </Space>
            )
          },
          {
            key: "coverage",
            label: "覆盖检查",
            children: (
              <Card title="共享库就绪度" bordered={false} style={shellStyle}>
                <Row gutter={[16, 16]}>
                  {Object.entries(overview?.coverage || {}).map(([key, value]) => (
                    <Col xs={24} md={12} xl={8} key={key}>
                      <Card size="small" bordered={false} style={statStyle}>
                        <Statistic
                          title={coverageLabelMap[key] || key}
                          value={value ? "已就绪" : "缺失"}
                          valueStyle={{ color: value ? "#16a34a" : "#d97706", fontSize: 20 }}
                        />
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            )
          }
        ]}
        tabBarStyle={{ marginBottom: 4 }}
      />
    </Space>
  );
}
