# posting

Schedule social media posting with simple local folder structure.

> Note: This project is in a very early development stage and is primarily intended for my personal use. Use at your own risk. I can't be responsible for any consequences of using the program.

## Set up

1. Clone this repo. `git clone https://github.com/cdaein/posting.git`
1. Go into the repo directory: `cd posting`
1. Install dependencies. `npm i`
1. Build the program. `npm run build`
1. Install as global command (dont forget the `.`): `npm i -g .`
1. Copy `.env.example` to `.env` and fill with your own details.
1. Copy `user.config.json.example` to `user.config.json` and fill with your own details. Most of all, set `watchDir` where you will store scheduled posts.
1. Use with commands below.

## Commands

### `posting create`

Run `posting create` to create and schedule a new post interactively. The media file paths you specify will be copied to the `watchDir`.

Instead of using the CLI command, you can manually create a timestamped (ie. `YYYY.MM.DD-HH.mm`) folder with `settings.json` and media files in the `watchDir`.

If you want to cancel any scheduled post, simply remove the post folder from `watchDir`.

### `posting watch`

Run `posting watch` to monitor the `watchDir` directory. Keep the program running in the background. Posting will publish a scheduled post if the timestamp of a scheduled post is within the publish window (+/- 10 minutes). Published posts are moved to `_published` folder. Any failed posts are moved to `_failed` folder.

There are three ways that Posting detects scheduled posts. First, when it starts, it scans the watch directory for any existing scheduled posts. Second, it scans any new posts added while it is running. Third, it will scan the watch directory every 5 minutes to see if any existing scheduled posts are within the publish time window.

## Supported Platforms

- Bluesky
  - You only need Bluesky username and password in `.env`.
  - Bluesky only supports image post.
- Mastodon
  - Getting API Key is very easy. Just go to your instance, click Preferences > Developement. Create a New Application with read/write access. Then, copy the Access Token to `.env`.
- ~~Instagram~~
  - IG API doesn't work as I expect it to. It's one of the worst APIs I've ever had to deal with.
- Threads
  - Threads API isn't much better. I wish you good luck with dealing with incomplete API doc and generating and replacing Access Tokens.
  - Threads API uses `curl` to download media files so it requires public URLs (no local uploading) for file attachments. Posting currently relies on Firebase Storage for this, which means you will need Firebase account. If posting is sucessful, the uploaded file is deleted from Firebase. Free tier of Firebase should be good enough in most cases.
- Twitter
  - Free Developer account is good enough for posting text and media tweets. Make sure to give read/write access when creating Access Token.

## Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
