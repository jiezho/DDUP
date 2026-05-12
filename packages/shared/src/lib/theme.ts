import { theme, type ThemeConfig } from "antd";

const baseToken = {
  colorPrimary: "#6750a4",
  colorInfo: "#6750a4",
  colorSuccess: "#4f6352",
  colorWarning: "#7a5c00",
  colorError: "#b3261e",
  colorTextBase: "#1d1b20",
  colorTextSecondary: "#49454f",
  colorTextTertiary: "#79747e",
  colorBorder: "#cac4d0",
  colorBorderSecondary: "#d8d2de",
  colorBgBase: "#fffbfe",
  colorBgLayout: "#f8f3fb",
  colorBgContainer: "#fef7ff",
  colorFill: "rgba(103, 80, 164, 0.08)",
  colorFillSecondary: "rgba(103, 80, 164, 0.10)",
  colorFillTertiary: "#f3edf7",
  colorFillQuaternary: "#ece6f0",
  colorPrimaryBg: "#eaddff",
  colorPrimaryBgHover: "#d0bcff",
  colorPrimaryBorder: "#d0bcff",
  colorPrimaryBorderHover: "#b69df8",
  colorPrimaryHover: "#5b3f99",
  colorPrimaryActive: "#4f378b",
  colorLink: "#6750a4",
  colorLinkHover: "#5b3f99",
  colorLinkActive: "#4f378b",
  borderRadius: 20,
  borderRadiusLG: 28,
  borderRadiusSM: 16,
  controlHeight: 42,
  controlHeightSM: 34,
  controlHeightLG: 48,
  lineWidth: 1,
  fontFamily:
    '"Roboto","Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,"Noto Sans","Liberation Sans",sans-serif',
  boxShadowSecondary: "0 10px 24px rgba(29, 27, 32, 0.08)",
  boxShadowTertiary: "0 4px 12px rgba(29, 27, 32, 0.08)"
} as const;

export function getDdupTheme(isPc: boolean): ThemeConfig {
  return {
    algorithm: theme.defaultAlgorithm,
    token: {
      ...baseToken,
      colorBgLayout: isPc ? "#f8f3fb" : "#fdf7ff",
      borderRadius: isPc ? 20 : 22,
      borderRadiusLG: isPc ? 28 : 24
    },
    components: {
      Layout: {
        bodyBg: isPc ? "#f8f3fb" : "#fdf7ff",
        headerBg: "rgba(254, 247, 255, 0.88)",
        siderBg: "#fef7ff",
        footerBg: "rgba(254, 247, 255, 0.92)",
        triggerBg: "transparent"
      },
      Card: {
        borderRadiusLG: 28,
        headerHeight: 56,
        colorBorderSecondary: "#d8d2de"
      },
      Button: {
        borderRadius: 999,
        defaultBg: "#f3edf7",
        defaultBorderColor: "#d0c7da",
        defaultColor: "#1d1b20",
        primaryShadow: "none"
      },
      Input: {
        borderRadius: 18,
        activeBorderColor: "#6750a4",
        hoverBorderColor: "#7f67be",
        activeShadow: "0 0 0 4px rgba(103, 80, 164, 0.12)"
      },
      Table: {
        borderColor: "#e7e0ec",
        headerBg: "#f3edf7",
        rowHoverBg: "#f7f2fa",
        headerBorderRadius: 18
      },
      Tabs: {
        inkBarColor: "#6750a4",
        itemSelectedColor: "#4f378b",
        itemHoverColor: "#6750a4",
        itemColor: "#49454f"
      },
      Menu: {
        itemBorderRadius: 16,
        itemSelectedBg: "#e8def8",
        itemSelectedColor: "#4f378b",
        itemHoverBg: "#f3edf7",
        subMenuItemBorderRadius: 16,
        groupTitleColor: "#79747e"
      },
      Segmented: {
        trackBg: "#ece6f0",
        itemSelectedBg: "#ffffff",
        itemSelectedColor: "#1d1b20",
        trackPadding: 4
      },
      Tag: {
        borderRadiusSM: 999,
        defaultBg: "#f3edf7",
        defaultColor: "#49454f"
      },
      Breadcrumb: {
        lastItemColor: "#1d1b20",
        linkColor: "#79747e",
        separatorColor: "#938f99"
      }
    }
  };
}
