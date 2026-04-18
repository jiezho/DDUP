import { Layout, Menu } from "antd";
import {
  ApartmentOutlined,
  HomeOutlined,
  ProfileOutlined,
  ReadOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import { PropsWithChildren, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import "./AppLayout.css";

const { Content, Footer } = Layout;

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

export default function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedKeys = useMemo(() => [routeToKey(location.pathname)], [location.pathname]);

  return (
    <Layout className="ddup-layout">
      <Content className="ddup-content">{children}</Content>
      <Footer className="ddup-footer">
        <Menu
          mode="horizontal"
          selectedKeys={selectedKeys}
          onClick={(e) => navigate(keyToRoute(e.key as NavKey))}
          items={[
            { key: "home", icon: <HomeOutlined />, label: "首页" },
            { key: "learning", icon: <ReadOutlined />, label: "学习" },
            { key: "assistant", icon: <UnorderedListOutlined />, label: "助手" },
            { key: "resources", icon: <ApartmentOutlined />, label: "资源" },
            { key: "me", icon: <ProfileOutlined />, label: "我的" }
          ]}
        />
      </Footer>
    </Layout>
  );
}

