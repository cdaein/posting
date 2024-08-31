# posting

Schedule social media posting with simple local folder structure.

> Note: This project is in a very early development stage and is primarily intended for my personal use. Use at your own risk. I can't be responsible for any consequences of using the program.

https://github.com/user-attachments/assets/30dd1525-bc9b-446d-bddc-7bbfb361fb5f

## Installation

`npm install -g @daeinc/posting`

## Commands

### `posting setup`

Run `posting setup` to set up envrionment variables such as API keys. This has to be set up before you can schedule and automate any posting. Your API credentials are locally stored in the `.env` file of the project's install directory and only used for each platform's API authentication. Run the script again to update any details.

### `posting create`

Run `posting create` to create and schedule a new post interactively. The media file paths you specify will be copied to the `watchDir`.

Instead of using the CLI command, you can manually create a timestamped (ie. `YYYY.MM.DD-HH.mm`) folder with `settings.json` and media files in the `watchDir`.

If you want to cancel any scheduled post, simply remove the post folder from `watchDir`.

### `posting watch`

Run `posting watch` to monitor the `watchDir` directory. Keep the program running in the background. Posting will publish a scheduled post if the timestamp of a scheduled post is within the publish window (+/- 5 minutes). Published posts are moved to `_published` folder. Any failed posts are moved to `_failed` folder.

There are three ways that Posting detects scheduled posts. First, when it starts, it scans the watch directory for any existing scheduled posts. Second, it scans any new posts added while it is running. Third, it will scan the watch directory every 5 minutes to see if any existing scheduled posts are within the publish time window.

If you pass `posting watch --stats` option, it checks stats (like counts, etc.) for your latest posts on supported platforms. It does once per hour at 0 minute between 6am and midnight.

## Supported Platforms

- Bluesky
  - Go to your account Settings > App Passwords and generate one.
  - Use your email, app password and handle when setting up with `posting setup`.
  - Bluesky doesn't support video.
- Mastodon
  - Getting API Key is very easy. Just go to your instance, click Preferences > Developement. Create a New Application with read/write access.
- Instagram/Threads
  - I wish you good luck with dealing with incomplete API doc and generating and replacing Access Tokens.
  - Instagram scope: `business_basic,business_manage_messages,business_manage_comments,business_content_publish`
  - Threads scope: `threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies,threads_manage_insights`
  - IG/Threads uses `curl` to download media files so it requires public URLs (no local uploading) for file attachments. Posting currently relies on Firebase Storage for this, which means you will need Firebase account. If posting is sucessful, the uploaded file is deleted from Firebase. Free tier of Firebase should be good enough in most cases.
  - Single media IG post is also published as IG story. For carousel post, only the first media is also published as IG story.
- Twitter
  - Get free Developer account. Make sure to give read/write access when creating Access Token.

## Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
