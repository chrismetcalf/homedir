module.exports = {
  defaultBrowser: "Google Chrome",
  handlers: [
    /*{
      match: finicky.matchHostnames(["amperity.atlassian.com"]),
      browser: "Jira"
    },*/
    {
      match: /https:\/\/\w+\.zoom.us\/j/,
      browser: "/Applications/zoom.us.app"
    }
  ]
};
