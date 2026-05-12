import { Alert, Button, Card, Col, Descriptions, Input, List, Row, Space, Statistic, Table, Tabs, Tag, Typography, theme } from "antd";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  getHermesBlueprint,
  getHermesInstanceDetail,
  getHermesInstances,
  getHermesOverview,
  getHermesSkills,
  searchHermesLibrary,
  type HermesBlueprint,
  type HermesInstanceDetail,
  type HermesInstanceListItem,
  type HermesOverview,
  type HermesSearchResponse,
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
  online: "success",
  partial: "warning",
  planned: "processing",
  unknown: "default"
};

const priorityColorMap: Record<string, string> = {
  P0: "red",
  P1: "gold",
  P2: "blue"
};

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace("T", " ").replace("+00:00", " UTC");
}

export default function HermesAdminPage() {
  const [overview, setOverview] = useState<HermesOverview | null>(null);
  const [blueprint, setBlueprint] = useState<HermesBlueprint | null>(null);
  const [instances, setInstances] = useState<HermesInstanceListItem[]>([]);
  const [skills, setSkills] = useState<HermesSkillsResponse | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [instanceDetail, setInstanceDetail] = useState<HermesInstanceDetail | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResult, setSearchResult] = useState<HermesSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token } = theme.useToken();

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResp, blueprintResp, instancesResp, skillsResp] = await Promise.all([
        getHermesOverview(),
        getHermesBlueprint(),
        getHermesInstances(),
        getHermesSkills()
      ]);
      setOverview(overviewResp);
      setBlueprint(blueprintResp);
      setInstances(instancesResp.items);
      setSkills(skillsResp);

      const defaultId = selectedInstanceId || instancesResp.items[0]?.id || null;
      setSelectedInstanceId(defaultId);
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
      setSearchResult(await searchHermesLibrary(keyword));
    } finally {
      setSearching(false);
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
        render: (_: unknown, record: HermesInstanceListItem) => record.capabilities.length
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
      <Card
        bordered={false}
        style={tonalStyle}
        bodyStyle={{ padding: 28 }}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Space wrap align="center" style={{ justifyContent: "space-between", width: "100%" }}>
            <Space direction="vertical" size={4}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                Hermes 管理台
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 760 }}>
                统一查看多 Hermes 实例、共享技能、记忆覆盖与方案蓝图。当前页面定位为只读治理入口，
                用于巡检、排障与结构对照。
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
            <Statistic title="在线实例" value={overview?.online_instances_count ?? 0} loading={loading} />
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

      <Alert
        type="info"
        showIcon
        message="当前说明"
        description="本页来自 /api/hermes/* 只读治理接口，适合做实例盘点、蓝图对照与共享库巡检。"
        style={{ borderRadius: 20 }}
      />

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
                <Card
                  title="实例详情"
                  extra={selectedInstanceId ? <Typography.Text type="secondary">{selectedInstanceId}</Typography.Text> : null}
                  bordered={false}
                  style={shellStyle}
                >
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
                        <Descriptions.Item label="数据目录就绪">
                          {instanceDetail.deployment.data_path_present ? "是" : "否"}
                        </Descriptions.Item>
                        <Descriptions.Item label="记忆最近更新">
                          {formatTime(instanceDetail.memory.latest_updated_at)}
                        </Descriptions.Item>
                        <Descriptions.Item label="产出索引数">
                          {instanceDetail.outputs.entries_count}
                        </Descriptions.Item>
                      </Descriptions>
                      <Space wrap>
                        {instanceDetail.capabilities.length ? (
                          instanceDetail.capabilities.map((item) => <Tag key={item}>{item}</Tag>)
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
                                  <List.Item.Meta
                                    title={item.name}
                                    description={`${item.relative_path} | ${formatTime(item.updated_at)}`}
                                  />
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
                            <List.Item.Meta
                              title={item.stage}
                              description={`${item.description}；检查点：${item.checkpoints.join(" / ")}`}
                            />
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
                        render: (value: string) => (
                          <Tag color={priorityColorMap[value] || "default"}>{value || "-"}</Tag>
                        )
                      },
                      {
                        title: "标签",
                        dataIndex: "tags",
                        key: "tags",
                        render: (value: string[]) => (
                          <Space wrap>{(value || []).map((item) => <Tag key={item}>{item}</Tag>)}</Space>
                        )
                      }
                    ]}
                  />
                </Card>
                <Card title="跨实例检索" bordered={false} style={shellStyle}>
                  <Space direction="vertical" style={{ width: "100%" }} size={12}>
                    <Input.Search
                      enterButton="搜索"
                      placeholder="检索实例、技能、memory-ext 记忆或产出摘要"
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
                              </Space>
                            }
                            description={item.snippet}
                          />
                        </List.Item>
                      )}
                    />
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
