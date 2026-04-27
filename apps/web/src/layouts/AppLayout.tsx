import { Avatar, Breadcrumb, Button, Layout, Menu, Segmented, Space, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  ApartmentOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ProfileOutlined,
  ReadOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import { PropsWithChildren, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useDisplayMode } from "../contexts/displayMode";
import "./AppLayout.css";

const { Content, Footer, Sider, Header } = Layout;

type NavKey = "home" | "learning" | "assistant" | "resources" | "me";

const routeToKey = (pathname: string): NavKey => {
  if (pathname.startsWith("/learning")) return "learning";
  if (pathname.startsWith("/assistant")) return "assistant";
  if (pathname.startsWith("/resources")) return "resources";
  if (pathname.startsWith("/me")) return "me";
  return "home";
};

const keyToRoute = (key: NavKey): string => {
  switch (key) {
    case "learning":
      return "/learning";
    case "assistant":
      return "/assistant";
    case "resources":
      return "/resources";
    case "me":
      return "/me";
    default:
      return "/home";
  }
};

const keyToTitle = (key: NavKey): string => {
  switch (key) {
    case "learning":
      return "学习";
    case "assistant":
      return "助手";
    case "resources":
      return "资源";
    case "me":
      return "我的";
    default:
      return "对话";
  }
};

const keyToSubtitle = (key: NavKey): string => {
  switch (key) {
    case "learning":
      return "术语库、复习队列与学习路径的最小闭环。";
    case "assistant":
      return "待办、习惯与灵感收件箱。";
    case "resources":
      return "资讯、图谱、文件与知识库检索。";
    case "me":
      return "统计复盘、模板产出与外部集成。";
    default:
      return "流式对话 + 结果卡；支持写入 Obsidian Wiki 暂存区。";
  }
};

export default function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();

  const { displayMode, resolvedMode, setDisplayMode } = useDisplayMode();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKeys = useMemo(() => [routeToKey(location.pathname)], [location.pathname]);
  const selectedKey = selectedKeys[0];

  const menuItems = useMemo<MenuProps["items"]>(
    () => [
      {
        type: "group" as const,
        label: "工作台",
        key: "g-workbench",
        children: [
          { key: "home", icon: <HomeOutlined />, label: "首页" },
          { key: "resources", icon: <ApartmentOutlined />, label: "资源" }
        ]
      },
      {
        type: "group" as const,
        label: "成长",
        key: "g-growth",
        children: [
          { key: "learning", icon: <ReadOutlined />, label: "学习" },
          { key: "assistant", icon: <UnorderedListOutlined />, label: "助手" }
        ]
      },
      {
        type: "group" as const,
        label: "系统",
        key: "g-system",
        children: [{ key: "me", icon: <ProfileOutlined />, label: "我的" }]
      }
    ],
    []
  );

  const menuItemsH5 = useMemo(
    () => [
      { key: "home", icon: <HomeOutlined />, label: "对话" },
      { key: "learning", icon: <ReadOutlined />, label: "学习" },
      { key: "assistant", icon: <UnorderedListOutlined />, label: "助手" },
      { key: "me", icon: <ProfileOutlined />, label: "我的" }
    ],
    []
  );

  if (resolvedMode === "pc") {
    return (
      <Layout className="ddup-shell ddup-shell--pc">
        <Sider
          width={240}
          collapsedWidth={72}
          collapsible
          collapsed={collapsed}
          trigger={null}
          className="ddup-sider"
          theme="dark"
        >
          <div className="ddup-brand">
            <div className="ddup-brand-dot" />
            {!collapsed ? <div className="ddup-brand-text">DDUP</div> : null}
          </div>
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            onClick={(e) => navigate(keyToRoute(e.key as NavKey))}
            items={menuItems}
          />
        </Sider>
        <Layout className="ddup-main">
          <Header className="ddup-topbar">
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Space size={12} align="center">
                <Button
                  type="text"
                  className="ddup-collapse-btn"
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setCollapsed((v) => !v)}
                />
                <Breadcrumb
                  items={[
                    { title: "DDUP" },
                    { title: keyToTitle(selectedKey) }
                  ]}
                />
              </Space>
              <Space size={12} align="center">
                <Typography.Text type="secondary" className="ddup-topbar-sub">
                  {displayMode === "auto" ? "自动" : displayMode === "pc" ? "PC" : "H5"}
                </Typography.Text>
                <Segmented
                  size="small"
                  value={displayMode}
                  options={[
                    { label: "自动", value: "auto" },
                    { label: "PC", value: "pc" },
                    { label: "H5", value: "h5" }
                  ]}
                  onChange={(v) => setDisplayMode(v as typeof displayMode)}
                />
                <Avatar size="small">U</Avatar>
              </Space>
            </Space>
          </Header>
          <Content className="ddup-content ddup-content--pc">
            <div className="ddup-content-inner">
              <div className="ddup-page-header">
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {keyToTitle(selectedKey)}
                </Typography.Title>
                <Typography.Text type="secondary">{keyToSubtitle(selectedKey)}</Typography.Text>
              </div>
              {children}
            </div>
          </Content>
        </Layout>
      </Layout>
    );
  }

  return (
    <Layout className="ddup-shell ddup-shell--h5">
      <Content className="ddup-content ddup-content--h5">{children}</Content>
      <Footer className="ddup-footer" style={{ ["--ddup-footer-items" as never]: menuItemsH5.length } as never}>
        <Menu
          mode="horizontal"
          disabledOverflow
          selectedKeys={selectedKeys}
          onClick={(e) => navigate(keyToRoute(e.key as NavKey))}
          items={menuItemsH5}
        />
      </Footer>
    </Layout>
  );
}
