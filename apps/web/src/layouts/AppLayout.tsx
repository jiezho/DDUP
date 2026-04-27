import { Layout, Menu, Segmented, Space, Typography } from "antd";
import {
  ApartmentOutlined,
  HomeOutlined,
  ProfileOutlined,
  ReadOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import { PropsWithChildren, useMemo } from "react";
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

export default function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();

  const { displayMode, resolvedMode, setDisplayMode } = useDisplayMode();

  const selectedKeys = useMemo(() => [routeToKey(location.pathname)], [location.pathname]);
  const selectedKey = selectedKeys[0];

  const menuItems = useMemo(
    () => [
      { key: "home", icon: <HomeOutlined />, label: "首页" },
      { key: "learning", icon: <ReadOutlined />, label: "学习" },
      { key: "assistant", icon: <UnorderedListOutlined />, label: "助手" },
      { key: "resources", icon: <ApartmentOutlined />, label: "资源" },
      { key: "me", icon: <ProfileOutlined />, label: "我的" }
    ],
    []
  );

  if (resolvedMode === "pc") {
    return (
      <Layout className="ddup-shell ddup-shell--pc">
        <Sider width={240} className="ddup-sider" theme="dark">
          <div className="ddup-brand">
            <div className="ddup-brand-dot" />
            <div className="ddup-brand-text">DDUP</div>
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
              <Space size={10} align="center">
                <Typography.Text className="ddup-topbar-title">{keyToTitle(selectedKey)}</Typography.Text>
                <Typography.Text type="secondary" className="ddup-topbar-sub">
                  {displayMode === "auto" ? "自动" : displayMode === "pc" ? "PC" : "H5"}
                </Typography.Text>
              </Space>
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
            </Space>
          </Header>
          <Content className="ddup-content ddup-content--pc">
            <div className="ddup-content-inner">{children}</div>
          </Content>
        </Layout>
      </Layout>
    );
  }

  return (
    <Layout className="ddup-shell ddup-shell--h5">
      <Content className="ddup-content ddup-content--h5">{children}</Content>
      <Footer className="ddup-footer">
        <Menu
          mode="horizontal"
          disabledOverflow
          selectedKeys={selectedKeys}
          onClick={(e) => navigate(keyToRoute(e.key as NavKey))}
          items={menuItems}
        />
      </Footer>
    </Layout>
  );
}

