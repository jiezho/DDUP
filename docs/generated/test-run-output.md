# DDUP Test Runs

| Date | Commit | Backend (pytest) | Frontend (vitest) | Notes |
|---|---|---|---|---|

## 2026-04-19 776751b

### Backend (pytest)

```
....                                                                     [100%]
============================== warnings summary ===============================
C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12: PendingDeprecationWarning: Please use `import python_multipart` instead.
    import multipart

tests/test_audit.py::test_action_execute_writes_audit
  E:\BaiduSyncdisk\���\2026.04\DDUP\apps\api\app\main.py:19: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    @app.on_event("startup")

tests/test_audit.py::test_action_execute_writes_audit
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\fastapi\applications.py:4495: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    return self.router.on_event(event_type)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
4 passed, 3 warnings in 0.65s
```

### Frontend (vitest)

```
> ddup-web@0.1.0 test
> vitest run


[7m[1m[36m RUN [39m[22m[27m [36mv0.34.6[39m [90mE:/BaiduSyncdisk/润电/2026.04/DDUP/apps/web[39m

 [32m✓[39m src/pages/HomeChatPage.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 1020[2mms[22m[39m
 [32m✓[39m src/App.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 506[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m   Start at [22m 08:36:06
[2m   Duration [22m 28.13s[2m (transform 281ms, setup 760ms, collect 35.28s, tests 1.53s, environment 3.87s, prepare 780ms)[22m


[90mstderr[2m | src/pages/HomeChatPage.test.tsx[2m > [22m[2mrenders space selector[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/App.test.tsx[2m > [22m[2mrenders home route[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.
Warning: An update to ForwardRef inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\rc-menu\lib\Menu.js:56:27
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\menu.js:46:26
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\index.js:19:37
    at footer
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:46:18
    at Footer
    at div
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:66:13
    at Layout
    at AppLayout (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\src\layouts\AppLayout.tsx:39:22)
    at App
    at Router (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router\dist\umd\react-router.development.js:1207:17)
    at BrowserRouter (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router-dom\dist\umd\react-router-dom.development.js:695:7)
```


## 2026-04-19 776751b

### Backend (pytest)

```
....                                                                     [100%]
============================== warnings summary ===============================
C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12: PendingDeprecationWarning: Please use `import python_multipart` instead.
    import multipart

tests/test_audit.py::test_action_execute_writes_audit
  E:\BaiduSyncdisk\���\2026.04\DDUP\apps\api\app\main.py:19: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    @app.on_event("startup")

tests/test_audit.py::test_action_execute_writes_audit
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\fastapi\applications.py:4495: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    return self.router.on_event(event_type)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
4 passed, 3 warnings in 0.40s
```

### Frontend (vitest)

```
> ddup-web@0.1.0 test
> vitest run


[7m[1m[36m RUN [39m[22m[27m [36mv0.34.6[39m [90mE:/BaiduSyncdisk/润电/2026.04/DDUP/apps/web[39m

 [32m✓[39m src/pages/HomeChatPage.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 480[2mms[22m[39m
 [32m✓[39m src/App.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 323[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m   Start at [22m 08:48:06
[2m   Duration [22m 6.10s[2m (transform 127ms, setup 297ms, collect 6.99s, tests 803ms, environment 1.25s, prepare 306ms)[22m


[90mstderr[2m | src/pages/HomeChatPage.test.tsx[2m > [22m[2mrenders space selector[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/App.test.tsx[2m > [22m[2mrenders home route[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.
Warning: An update to ForwardRef inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\rc-menu\lib\Menu.js:56:27
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\menu.js:46:26
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\index.js:19:37
    at footer
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:46:18
    at Footer
    at div
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:66:13
    at Layout
    at AppLayout (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\src\layouts\AppLayout.tsx:39:22)
    at App
    at Router (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router\dist\umd\react-router.development.js:1207:17)
    at BrowserRouter (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router-dom\dist\umd\react-router-dom.development.js:695:7)
```


## 2026-04-19 776751b

### Backend (pytest)

```
....                                                                     [100%]
============================== warnings summary ===============================
C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12: PendingDeprecationWarning: Please use `import python_multipart` instead.
    import multipart

tests/test_audit.py::test_action_execute_writes_audit
  E:\BaiduSyncdisk\���\2026.04\DDUP\apps\api\app\main.py:19: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    @app.on_event("startup")

tests/test_audit.py::test_action_execute_writes_audit
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\fastapi\applications.py:4495: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    return self.router.on_event(event_type)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
4 passed, 3 warnings in 0.63s
```

### Frontend (vitest)

```
> ddup-web@0.1.0 test
> vitest run


[7m[1m[36m RUN [39m[22m[27m [36mv0.34.6[39m [90mE:/BaiduSyncdisk/润电/2026.04/DDUP/apps/web[39m

 [32m✓[39m src/pages/HomeChatPage.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 485[2mms[22m[39m
 [32m✓[39m src/App.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 328[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m   Start at [22m 08:49:07
[2m   Duration [22m 19.07s[2m (transform 270ms, setup 767ms, collect 23.95s, tests 813ms, environment 4.13s, prepare 766ms)[22m


[90mstderr[2m | src/pages/HomeChatPage.test.tsx[2m > [22m[2mrenders space selector[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/App.test.tsx[2m > [22m[2mrenders home route[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.
Warning: An update to ForwardRef inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\rc-menu\lib\Menu.js:56:27
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\menu.js:46:26
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\index.js:19:37
    at footer
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:46:18
    at Footer
    at div
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:66:13
    at Layout
    at AppLayout (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\src\layouts\AppLayout.tsx:39:22)
    at App
    at Router (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router\dist\umd\react-router.development.js:1207:17)
    at BrowserRouter (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router-dom\dist\umd\react-router-dom.development.js:695:7)
```


## 2026-04-19 776751b

### Backend (pytest)

```
....                                                                     [100%]
============================== warnings summary ===============================
C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12: PendingDeprecationWarning: Please use `import python_multipart` instead.
    import multipart

tests/test_audit.py::test_action_execute_writes_audit
  E:\BaiduSyncdisk\���\2026.04\DDUP\apps\api\app\main.py:19: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    @app.on_event("startup")

tests/test_audit.py::test_action_execute_writes_audit
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\fastapi\applications.py:4495: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    return self.router.on_event(event_type)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
4 passed, 3 warnings in 0.42s
```

### Frontend (vitest)

```
> ddup-web@0.1.0 test
> vitest run


[7m[1m[36m RUN [39m[22m[27m [36mv0.34.6[39m [90mE:/BaiduSyncdisk/润电/2026.04/DDUP/apps/web[39m

 [32m✓[39m src/pages/HomeChatPage.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 447[2mms[22m[39m
 [32m✓[39m src/App.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 321[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m   Start at [22m 11:15:18
[2m   Duration [22m 6.24s[2m (transform 141ms, setup 290ms, collect 7.25s, tests 768ms, environment 1.24s, prepare 321ms)[22m


[90mstderr[2m | src/pages/HomeChatPage.test.tsx[2m > [22m[2mrenders space selector[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/App.test.tsx[2m > [22m[2mrenders home route[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.
Warning: An update to ForwardRef inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\rc-menu\lib\Menu.js:56:27
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\menu.js:46:26
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\index.js:19:37
    at footer
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:46:18
    at Footer
    at div
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:66:13
    at Layout
    at AppLayout (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\src\layouts\AppLayout.tsx:39:22)
    at App
    at Router (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router\dist\umd\react-router.development.js:1207:17)
    at BrowserRouter (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router-dom\dist\umd\react-router-dom.development.js:695:7)
```


## 2026-04-19 776751b

### Backend (pytest)

```
....                                                                     [100%]
============================== warnings summary ===============================
C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\starlette\formparsers.py:12: PendingDeprecationWarning: Please use `import python_multipart` instead.
    import multipart

tests/test_audit.py::test_action_execute_writes_audit
  E:\BaiduSyncdisk\���\2026.04\DDUP\apps\api\app\main.py:19: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    @app.on_event("startup")

tests/test_audit.py::test_action_execute_writes_audit
  C:\Users\Admin\AppData\Roaming\Python\Python311\site-packages\fastapi\applications.py:4495: DeprecationWarning: 
          on_event is deprecated, use lifespan event handlers instead.
  
          Read more about it in the
          [FastAPI docs for Lifespan Events](https://fastapi.tiangolo.com/advanced/events/).
          
    return self.router.on_event(event_type)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
4 passed, 3 warnings in 0.43s
```

### Frontend (vitest)

```
> ddup-web@0.1.0 test
> vitest run


[7m[1m[36m RUN [39m[22m[27m [36mv0.34.6[39m [90mE:/BaiduSyncdisk/润电/2026.04/DDUP/apps/web[39m

 [32m✓[39m src/pages/HomeChatPage.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 442[2mms[22m[39m
 [32m✓[39m src/App.test.tsx [2m ([22m[2m1 test[22m[2m)[22m[33m 323[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m   Start at [22m 11:16:03
[2m   Duration [22m 6.15s[2m (transform 154ms, setup 295ms, collect 7.01s, tests 765ms, environment 1.27s, prepare 314ms)[22m


[90mstderr[2m | src/pages/HomeChatPage.test.tsx[2m > [22m[2mrenders space selector[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/App.test.tsx[2m > [22m[2mrenders home route[22m[39m
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.
Warning: An update to ForwardRef inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\rc-menu\lib\Menu.js:56:27
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\menu.js:46:26
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\menu\index.js:19:37
    at footer
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:46:18
    at Footer
    at div
    at E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\antd\lib\layout\layout.js:66:13
    at Layout
    at AppLayout (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\src\layouts\AppLayout.tsx:39:22)
    at App
    at Router (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router\dist\umd\react-router.development.js:1207:17)
    at BrowserRouter (E:\BaiduSyncdisk\润电\2026.04\DDUP\apps\web\node_modules\react-router-dom\dist\umd\react-router-dom.development.js:695:7)
```

