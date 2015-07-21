<link href="../../plugins/nodebb-plugin-import/css/acp.css" rel="stylesheet" />

<div class="import-wrapper">
<h1>
    <i class="fa fa-magic"></i> Import
</h1>

<form role="form" class="import-settings">
<fieldset>
<div class="col-sm-12 import-config-wrapper">
    <div class="col-sm-12 import-config">
        <h2>Exporter Configs</h2>
        <h4>Source DB Configs</h4>
        <p class="help-block">Not all are required, it really depends on each the database type and exporter you're using</p>
        <div class="form">
            <div class="form-group">
                <label for="exporter-dbhost">Database host</label>
                <input type="text" class="form-control" name="exporter-dbhost" id="exporter-dbhost" placeholder="127.0.0.1">

                <label for="exporter-dbname">Database name</label>
                <input type="text" class="form-control" name="exporter-dbname" id="exporter-dbname" placeholder="my_schema">

                <label for="exporter-dbuser">Database username</label>
                <input type="text" class="form-control" name="exporter-dbuser" id="exporter-dbuser" placeholder="user">

                <label for="exporter-dbpass">Database password</label>
                <input type="password" class="form-control" name="exporter-dbpass" id="exporter-dbpass" placeholder="password">

                <label for="exporter-dbport">Database port</label>
                <input type="text" class="form-control" name="exporter-dbport" id="exporter-dbport" placeholder="3306 (i.e. mysql)">

                <label for="exporter-tablePrefix">Table prefix (if applicable)</label>
                <input type="text" class="form-control" name="exporter-tablePrefix" id="exporter-tablePrefix" placeholder="ubbt_">

				<label for="exporter-custom">Exporter specific configs (if applicable)</label>
				<p class="help-block">
					Some exporters support custom config, check each's readme first. Most require that you pass a valid JSON here. i.e. the -wordpress exporter
				</p>
				<input type="text" class="form-control" name="exporter-custom" id="exporter-custom" placeholder='{"galleryShortcodes": "toURLs"}'>
            </div>
        </div>

        <hr />

        <div class="form-group">
            <h4>Select an Exporter</h4>

            <label for="exporter-module">Select one of the hardcoded ones, or click to refresh from NPM's registry
            	<i data-on="click" data-action="findExporters" id="exporter-module-refresh" class="exporter-module-spinner import-hand fa fa-refresh"></i>
            	<i class="fa fa-spinner exporter-module-spinner hidden"></i>
            </label>
            <select
				data-on="change"
				data-action="matchVal"
				data-target="#exporter-module-input"
            	class="form-control"
            	id="exporter-module"
            	name="exporter-module">
            	<!-- BEGIN exporters -->
					<option class="exporter-module-option" value="{exporters.name}">{exporters.name}</option>
            	<!-- END exporters -->
          	</select>

          	<p class="help-block">
          		The reason I don't fetch from NPM by default is that, this API call using (<code>npm.commands.search()</code>) is very slow, consumes a lot of memory, and crashes the process sometimes.
          		To add yours to the hardcoded list, submit a pull request editing the <code>optionalDependencies</code> block in <a href="https://github.com/akhoury/nodebb-plugin-import/blob/master/package.json" target="_blank">package.json</a>
          	</p>

            <label for="exporter-module-input">Or just enter the module's name or url you want to install</label>
            <p class="help-block">
                You can enter any valid npm package name, tarball file/url etc. see <a target="_blank" href="https://www.npmjs.org/doc/cli/npm-install.html">npm docs</a>
                <br /> i.e.
                <code class="import-code-example">nodebb-plugin-import-vbulletin</code> or <br />
                <code class="import-code-example">git://github.com/psychobunny/nodebb-plugin-import-phpbb#master</code> or <br/>
                <code class="import-code-example">nodebb-plugin-import-ubb@0.1.0</code> etc.<br />
                if a value exists here, it will take precedence over the select box value right above it.
            </p>
            <input type="text" class="form-control" id="exporter-module-input" name="exporter-module-input" placeholder="nodebb-plugin-my-compatible-exporter@0.0.1">


			<div class="checkbox">
				<label for="exporter-module-skip-install">
					<input type="checkbox" id="exporter-module-skip-install" name="exporter-module-skip-install" />
					Skip the module install
				</label>
				<p class="help-block">
					[Advanced] skips the install of the selected module, with the assumption that you already installed it your self,
					say you're developing and you don't want the importer to touch your files, but you still need to specify it in the fields above.
					If you're in doubt, don't check it.
				</p>
			</div>
        </div>

        <div class="form-group">
            <h2>Importer Configs</h2>

            <div class="form-group">
                <div class="checkbox">
                    <label for="importer-passwordgen-enabled">
                        <input
                                data-on="change"
                                data-action="visibleToggle"
                                data-target=".importer-passwordgen-configs"
                                type="checkbox"
                                id="importer-passwordgen-enabled"
                                name="importer-passwordgen-enabled">
                        Auto Password Generation
                    </label>
                    <p class="help-block">
                    	Auto Generate passwords for users, if no passwords are provided.
                    	If checked, this will hit performance, if unchecked, all passwords are NULL so all users will need to reset their passwords before login in.
                    	The latter is the recommended behavior, but if you still want to auto generate the password, you can.
                    	Then after the import is done, use the Post-Import tools to download a CSV file of all of users with their passwords to email it to them
                    </p>
                </div>
            </div>

            <div class="importer-passwordgen-configs" style="display: none;">
                <label for="importer-passwordgen-chars">Password generation uses these characters</label>
                <input value="{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890" type="text" class="form-control" id="importer-passwordgen-chars" name="importer-passwordgen-chars" placeholder="{}.-_=+qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890">
                <label for="importer-passwordgen-len">Passwords length</label>
                <input value="13" type="number" min="6" max="20" class="form-control" id="importer-passwordgen-len" name="importer-passwordgen-len" placeholder="13">
            </div>

            <hr />

            <div class="form-group">
                <div class="checkbox">
                    <label for="importer-admin-take-ownership">
                        <input
                                data-on="change"
                                data-action="visibleToggle"
                                data-target=".importer-admin-take-ownership-fields"
                                type="checkbox" id="importer-admin-take-ownership"
                                name="importer-admin-take-ownership"> I want to take ownership of a specific user's posts
                    </label>
                    <p class="help-block">
                        Say in your old forum you were the main admin, and your username was 'italian-desire', now after you've setup NodeBB, you decided to use the same
                        username; 'italian-desire' (meaning when you ran <code>node app --setup</code> or <code>./nodebb setup</code>).

                        <br /> If you check this box and enter the username hat you want to take ownership of its posts, that user 'creation' will be skipped, and all of its posts, will owned by you, the main NodeBB admin and first user (uid=1).
                        <br /> If you do not check this box, and it happens that you've chosen a username that already exists in your old database, that username's account creation,
                        will be skipped, because NodeBB cannot create 2 accounts with the same username, and all of its posts will be posted as 'guest'.
                    </p>
                </div>
                <div class="importer-admin-take-ownership-fields hidden">
                    <label for="importer-admin-take-ownership-uid">Old User Id</label>
                    <input class="form-control" type="text" id="importer-admin-take-ownership-uid" name="importer-admin-take-ownership-uid" placeholder="0 (old user id, aka _uid)"/>
                    <label for="importer-admin-take-ownership-username">Old Username</label>
                    <input class="form-control" type="text" id="importer-admin-take-ownership-username" name="importer-admin-take-ownership-username" placeholder="italian-desire (case insensitive)"/>
                    <p class="help-block">
                        No need to use both, either fields would work, if you use both, the <code>username</code> will be ignored, only the <code>uid</code> will be used.
                    </p>
                </div>
            </div>

            <hr />

            <div class="form-group">
                <div class="checkbox">
                    <label for="importer-autoconfirm-emails">
                        <input checked type="checkbox" id="importer-autoconfirm-emails" name="importer-autoconfirm-emails"> Auto confirm user accounts
                    </label>
                    <p class="help-block">
                        Let the importer auto confirm the users new email automatically
                        <br/>
                        It will try to set the nodebb <code>email:*:confirm</code> records to true
                        and also delete all the <code>confirm:*KEYS*:emails</code>
                    </p>
                </div>
            </div>

            <hr />

            <div class="form-group">
                <label for="importer-user-reputation-multiplier">
                    Users reputation multiplier
                </label>
                <input value="1" type="number" min="0" id="importer-user-reputation-multiplier" name="importer-user-reputation-multiplier" class="form-control">
                <p class="help-block">If you want to boost the karma</p>
            </div>

            <hr />

            <div class="form-group">
                <h4>Categories styling</h4>
                <p class="help-block">You can change these later.</p>
                <label for="importer-categories-text-colors">List of new categories text colors to use</label>
                <p class="help-block">Comma separated values of text colors to be randomly chosen from</p>
                <input value="#FFFFFF" type="text" id="importer-categories-text-colors" name="importer-categories-text-colors" placeholder="#FFFFFF,#EEEEEE" class="form-control">
                <label for="importer-categories-bg-colors">List of new categories background colors to use</label>
                <p class="help-block">Comma separated values of background colors to be randomly chosen from</p>
                <input value="#ab1290,#004c66,#0059b2" type="text" id="importer-categories-bg-colors" name="importer-categories-bg-colors" placeholder="#ab1290,#004c66,#0059b2" class="form-control">
                <label for="importer-categories-icons">List of new categories icons to use</label>
                <p class="help-block">Comma separated values of <a href="http://fortawesome.github.io/Font-Awesome/icons/" target="_blank">font-awesome</a> icons to be randomly chosen from</p>
                <input value="fa-comment" type="text" id="importer-categories-icons" name="importer-categories-icons" placeholder="fa-comment,fa-home" class="form-control">
            </div>
        </div>

        <button class="btn btn-lg btn-info hidden" data-on="click" data-action="resume" id="import-resume" type="button">Last run was interrupted, try to resume</button>

        <button class="btn btn-lg btn-success" data-on="click" data-action="start" id="import-start" type="button">Flush NodeBB DB, then import</button>

        <button class="btn btn-lg btn-danger hidden" data-on="click" data-action="stop" id="import-stop" type="button">Stop</button>

        <button class="btn btn-lg btn-primary pull-right" data-on="click" data-action="saveSettings" id="save" type="button">Save Config</button>
    </div>

    <div class="text-center">
        <span title="Toggle settings" data-target-visible-direction="down" data-on="click" data-action="slideVerticalToggle" data-target=".import-config" class="import-hand">Toggle pre-import settings</span>
    </div>
</div>

<div class="col-sm-12 import-tools-wrapper">
<div class="col-sm-12 import-tools">

<h2>Post Import Tools </h2>
<p class="help-block">
    The post import tools only works if you have previously imported your data using this plugin.
    The way it works is that it would have augmented your NodeBB records (users, categories, topics and posts)
    with the necessary original fields and values, and these post-import-tools can use these original values to do/get
    some useful stuff. <br />
</p>

<div class="form-group">
    <h4 for="importer-convert">Content conversion</h4>
    <p class="help-block">
        Convert your user signatures, categories names and descriptions, topics titles and content, and posts content,
        to Markdown (the preferred NodeBB format language).

        If you have another [from-to] format you want to add, let me know, or pull request it
    </p>

    <div class="form-group">
        <div class="checkbox">
            <label for="content-convert-use-parse-before">
                <input data-on="change" data-action="visibleToggle" data-target=".content-convert-parse-before-container" type="checkbox" id="content-convert-use-parse-before" name="content-convert-use-parse-before"> Pre-parse all content with my custom JavaScript
            </label>
            <p class="help-block">
                For advanced users only. This function will run <b>before</b> the main convert function, use it wisely. If it has invalid syntax or causes runtime error, it will be ignored.
            </p>
        </div>
        <div class="content-convert-parse-before-container hidden">
            <p class="help-block">
                <code>function parseBefore(content) {</code>
            </p>
            <textarea class="form-control" id="content-convert-parse-before" name="content-convert-parse-before" placeholder="content = content.replace(/orange/g, 'apple'); "></textarea>
            <p class="help-block">
                <code>&nbsp;&nbsp;return content;</code><br />
                <code>}</code>
            </p>
        </div>
    </div>

    <label for="content-convert-main">
        Main convert
    </label>
    <p class="help-block">
        Uses other scripts such as
        <a target="_blank" href="https://github.com/akhoury/bbcode-to-markdown">bbcode-to-markdown</a>
        and
        <a target="_blank" href="https://github.com/akhoury/html-md-optional_window">html-md</a>
        to help convert the content.
    </p>
    <select class="form-control" id="content-convert-main" name="content-convert-main">
        <option value="">Don't touch my content</option>
        <option value="bbcode-to-md">BBCode to Markdown</option>
        <option value="html-to-md">HTML to Markdown</option>
    </select>


    <div class="form-group">
        <div class="checkbox">
            <label for="content-convert-use-parse-after">
                <input data-on="change" data-action="visibleToggle" data-target=".content-convert-parse-after-container" type="checkbox" id="content-convert-use-parse-after" name="content-convert-use-parse-after"> Post-parse all content with my custom JavaScript
            </label>
            <p class="help-block">
                For advanced users only. This function will run <b>after</b> the main convert function, use it wisely. If it has invalid syntax or causes runtime error, it will be ignored.
            </p>
        </div>
        <div class="content-convert-parse-after-container hidden">
            <p class="help-block">
                <code>function parseAfter(content) {</code>
            </p>
            <textarea class="form-control" id="content-convert-parse-after" name="content-convert-parse-after" placeholder="content = content.replace(/apple/g, 'kitkat'); "></textarea>
            <p class="help-block">
                <code>&nbsp;&nbsp;return content;</code><br />
                <code>}</code>
            </p>
        </div>
    </div>

    <label>
        What to convert
    </label>
    <div class="form-horizontal">
        <div class="checkbox">
            <label for="content-convert-users-signatures">
                <input checked type="checkbox" id="content-convert-users-signatures" name="content-convert-users-signatures"> User's signatures
            </label>
        </div>
        <div class="checkbox">
            <label for="content-convert-messages">
                <input checked type="checkbox" id="content-convert-messages" name="content-convert-messages"> Private Messages
            </label>
        </div>
        <div class="checkbox">
            <label for="content-convert-groups">
                <input checked type="checkbox" id="content-convert-groups" name="content-convert-groups"> Groups descriptions
            </label>
        </div>
        <div class="checkbox">
            <label for="content-convert-categories-names">
                <input checked type="checkbox" id="content-convert-categories-names" name="content-convert-categories-names"> Categories names
            </label>
        </div>
        <div class="checkbox">
            <label for="content-convert-categories-descriptions">
                <input checked type="checkbox" id="content-convert-categories-descriptions" name="content-convert-categories-descriptions"> Categories descriptions
            </label>
        </div>
        <div class="checkbox">
            <label for="content-convert-topics-titles">
                <input checked type="checkbox" id="content-convert-topics-titles" name="content-convert-topics-titles"> Topics titles
            </label>
        </div>
        <div class="checkbox">
            <label for="content-convert-topics-content">
                <input checked type="checkbox" id="content-convert-topics-content" name="content-convert-topics-content"> Topics content
            </label>
        </div>
        <div class="checkbox">
            <label for="content-convert-posts-content">
                <input checked type="checkbox" id="content-convert-posts-content" name="content-convert-posts-content"> Posts content
            </label>
        </div>
    </div>

    <button
            title="Attempts to convert all selected content"
            class="btn btn-lg btn-default import-convert-btn disabled"
            disabled="disabled"
            data-on="click"
            data-action="convertContent"
            id="convert-content"
            type="button">Start Convert (might take some time)
    </button>

</div>

<hr />

<div class="form-group">
    <h4 for="importer-templates">Redirection templates</h4>
    <p class="help-block">
        These templates allow you to create redirection maps; Set the desirable templates and click on 'redirect.map.json' to download it the prepared map.
        The map will include each old path mapped to a relevant new NodeBB one, based on the templates provided.
        For example, some forums uses IDs in the URLs, some uses slugs. The old paths here are an example of the
        UBB forum's way, and the disabled ones are the NodeBB way. Change the old paths at will.
        <br />
        You can use them with,
        either an <a href="http://wiki.nginx.org/HttpMapModule" target="_blank">NGINX MapModule</a> or this lite <a href="https://github.com/akhoury/RedirectBB" target="_blank">"redirector"</a> that I wrote for this purpose.
        <br />
        Note the templating syntax, it uses the <a href="http://underscorejs.org/#template" target="_blank">Underscore.js's template</a>
        <br/>
        DO NOT TOUCH THE "* new path" FIELDS IF YOU DO NOT KNOW WHAT YOU'RE DOING
    </p>
    <div class="redirection-templates-configs">
        <label for="redirection-templates-users-oldpath">Users old path</label>
        <input value="/forums/ubbthreads.php/users/<%= _uid %>" type="text" class="form-control" id="redirection-templates-users-oldpath" name="redirection-templates-users-oldpath" placeholder="/forums/ubbthreads.php/users/<%= _uid %>">
        <label for="redirection-templates-users-newpath">Users new path</label>
        <input disabled="disabled" value="/user/<%= userslug %>" type="text" class="form-control" id="redirection-templates-users-newpath" name="redirection-templates-users-newpath" placeholder="/user/<%= userslug %>">

        <label for="redirection-templates-categories-oldpath">Categories old path</label>
        <input value="/forums/ubbthreads.php/forums/<%= _cid %>" type="text" class="form-control" id="redirection-templates-categories-oldpath" name="redirection-templates-categories-oldpath" placeholder="/forums/ubbthreads.php/forums/<%= _cid %>">
        <label for="redirection-templates-categories-newpath">Categories new path</label>
        <input disabled="disabled" value="/category/<%= cid %>" type="text" class="form-control" id="redirection-templates-categories-newpath" name="redirection-templates-categories-newpath" placeholder="/category/<%= cid %>">

        <label for="redirection-templates-topics-oldpath">Topics old path</label>
        <input value="/forums/ubbthreads.php/topics/<%= _tid %>" type="text" class="form-control" id="redirection-templates-topics-oldpath" name="redirection-templates-topics-oldpath" placeholder="/forums/ubbthreads.php/topics/<%= _tid %>">
        <label for="redirection-templates-topics-newpath">Topics new path</label>
        <input disabled="disabled" value="/topic/<%= tid %>" type="text" class="form-control" id="redirection-templates-topics-newpath" name="redirection-templates-topics-newpath" placeholder="/topic/<%= tid %>">

        <label for="redirection-templates-posts-oldpath">Posts old path</label>
        <p class="help-block">
            Most Forums uses the '#' (location.hash) to add the post id to the path, this cannot be easily redirected
            without some client side JS 'Redirector' that grabs that # value and add to the query string or something
            but if your old-forums doesn't do that, feel free to edit that config.

            By default this it's blank to disable it and increase performance,
            it is a little bit of a CPU hog since the posts have the highest number of records
            and this require string processing, so if
            you're okay with redirecting oldTopicPaths and oldPostsPaths to the newTopicPaths without scrolling to the right post in the topic, leave this empty.
        </p>
        <input value="" type="text" class="form-control" id="redirection-templates-posts-oldpath" name="redirection-templates-posts-oldpath" placeholder="/topics/<%= _tid %>/*#Post<%= _pid %>" >
        <label for="redirection-templates-posts-newpath">Posts new path</label>
        <input disabled="disabled" value="/topic/<%= tid %>/#<%= pid %>" type="text" class="form-control" id="redirection-templates-posts-newpath" name="redirection-templates-posts-newpath" placeholder="/topic/<%= tid %>/#<%= pid %>">
    </div>
    <p></p>
    <button
            title="Attempts to retrieve and download redirect.map.json of your last import run"
            class="btn btn-lg btn-default import-download-btn disabled"
            disabled="disabled"
            data-on="click"
            data-action="downloadRedirectionJson"
            id="download-redirection-json"
            type="button">Download redirect.map.json (might take some time)
    </button>
</div>

<div class="form-group">
    <h4>Users download</h4>
    <p class="help-block">
        Download a CSV or a JSON file that contains many of your users info, so you can blast an email to them or something, (you can use the CSV file with <a target="_blank" href="http://akhoury.github.io/pages/mandrill-blast/">this tool</a>)
    </p>

    <button
            title="Attempts to retrieve and download users.csv from your last import run"
            class="btn btn-lg btn-default import-download-btn disabled"
            disabled="disabled"
            data-on="click"
            data-action="downloadUsersCsv"
            id="download-users-csv"
            type="button">Download users.csv (might take some time)
    </button>

    <button
            title="Attempts to retrieve and download users.json from your last import run"
            class="btn btn-lg btn-default import-download-btn disabled"
            disabled="disabled"
            data-on="click"
            data-action="downloadUsersJson"
            id="download-users-json"
            type="button">Download users.json (might take some time)
    </button>
</div>


<div class="form-group">
    <h4>Delete the old original data which was augmented to my NodeBB Database</h4>
    <p class="help-block">
        If you're done using the post-import-tools, you can clean up the original/augmented data from your NodeBB DB, however,
        you cannot revert this step, so you won't be able to use the post-import-tools unless you re-import your data.

        Note: This <b>will not</b> touch your original source forum database and will not delete your legitimate NodeBB records - only the ones this plugin added for convenience.
    </p>
    <button
            title="Deletes all the extra added fields to the NodeBB records"
            class="btn btn-lg btn-danger import-delete-originals disabled"
            disabled="disabled"
            data-on="click"
            data-action="deleteExtraFields"
            id="delete-originals"
            type="button">
             Delete all the extra records that this plugin has added to my NodeBB DB, I understand that I will not be able to use the Post-Import tools and I cannot revert this action.
    </button>
</div>

</div>
<div class="text-center">
    <span title="Toggle settings" data-target-visible-direction="down" data-on="click" data-action="slideVerticalToggle" data-target=".import-tools" class="import-hand">Toggle post-import tools</span>
</div>
</div>
</fieldset>

<div class="import-toolbar import-overflow-hidden">
    <div class="form">
        <div class="checkbox">
            <label for="log-control-server">
                <input class="log-control" type="checkbox" id="log-control-server" name="log-control-server"> Save logs on server
            </label>
            <p class="help-block">
                Try disabling this if the server is crashing due to 'EMFILE too many open files' or 'Segmentation fault'
            </p>
        </div>
        <div class="checkbox">
            <label for="log-control-client">
                <input checked class="log-control" type="checkbox" id="log-control-client" name="log-control-client"> Log on client
            </label>
            <p class="help-block">
                Show logs on in the logs area below, might crash your page with a large DB, it's ok the process will keep going. Just refresh the page, or close it.
            </p>
        </div>
        <div class="checkbox">
            <label for="log-control-verbose">
                <input data-on="change" data-action="toggleVerboseLogs" class="log-control" type="checkbox" id="log-control-verbose" name="log-control-verbose"> Verbose
            </label>
            <p class="help-block">
               Will probably crash your page, and exhaust your CPU when importing a large database
            </p>
        </div>
    </div>

</div>
</form>

<div class="import-state-container">
    <p class="help-block">
        <strong>NOTE:</strong> If for some reason the process gets interrupted or crashes, i.e. Segmentation Fault, just restart NodeBB,
        wait till it's ready, refresh this page, Open the Pre-Import settings, scroll down to find a button to resume.
        In <i>most</i> cases you should be able to resume where you left off.
     </p>
    <h4>
        State:
        <span class="controller-state-now">Idle</span><i class="fa controller-state-icon"></i>,
        by event:
        <span class="controller-state-event">none</span> |
            <span class="controller-progress">
                Phase: <b class="controller-progress-phase"></b>
                Progress: <b class="controller-progress-percentage">0</b>%
            </span>
    </h4>
</div>

<div class="import-logs-container">
    <h4>Logs (in reversed order, newest on top)</h4>
    <div class="import-logs col-sm-12"></div>
</div>

<p class="help-block">
    <br/>
<h4><a target="_blank" href="https://github.com/akhoury/nodebb-plugin-import#some-common-issues">Some common issues</a></h4>
</p>

<p class="help-block">
    For all problems, please file an issue at the plugin's <a href="https://github.com/akhoury/nodebb-plugin-import" target="_blank">gitbub repo</a>
</p>
</div>

<script src="../../plugins/nodebb-plugin-import/js/utils.js"></script>
<script src="../../plugins/nodebb-plugin-import/js/acp.js"></script>
