module.exports = {
  defaultBrowser: "/Applications/Google Chrome.app",
  handlers: [
    {
      // Open apple.com and example.org urls in Safari
      match: finicky.matchHostnames(["apple.com", "example.org"]),
      browser: "Safari"
    }
    ,{
      match: finicky.matchHostnames(["amperity.atlassian.com"]),
      browser: "Jira"
    }
    ,{
      // Open any url including the string "workplace" in Firefox
      match: /workplace/,
      browser: "Firefox"
    }
  ]
};
