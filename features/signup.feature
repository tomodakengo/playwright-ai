Feature: 会員登録を行い、マイページの表示内容を確認する

  Scenario Outline: Signup
    Given HOTELPLANISPHEREのホームページにアクセスする
    When 会員登録リンクを押下する
    And ページの見出しが「会員登録」であることを確認する
    And 会員登録画面で「<signup_input>」を入力する
    And 登録ボタンを押下する
    Then ページの見出しが「マイページ」であることを確認する
    And マイページ画面で各項目が「<mypage_validate>」であることを確認する
    And マイページ画面でログアウトボタンを押下する


    Examples:
    | signup_input | mypage_validate |
    | {"会員情報_入力":{"name": "テスト太郎", "email": "test-t@example.com", "password":"pazzw0rd", "password_confirm":"pazzw0rd", "rank":"プレミアム会員", "address":"豊島区", "phone":"04099999999", "gender":"男性", "birthday":"1999-01-01","check_flag":"受け取る"}} | {"マイページ情報_検証":{"name": "テスト太郎", "email": "test-t@example.com", "rank":"プレミアム会員", "address":"豊島区", "phone":"04099999999", "gender":"男性", "birthday":"1999年1月1日","check_flag":"受け取る"}}  |
