<link href="/plugins/nodebb-plugin-import/css/acp.css" rel="stylesheet" />

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
                        </div>
                    </div>

                    <hr />

                    <div class="form-group">
                        <h4>Select an Exporter</h4>

                        <label for="exporter-module">Select one of the few detected on npmjs's registry</label><i class="fa fa-spinner exporter-module-spinner"></i>
                        <select class="form-control" id="exporter-module" name="exporter-module"></select>

                        <label for="exporter-module-input">Or just enter the module's name or url you want to install</label>
                        <p class="help-block">
                            You can enter any valid npm package name, tarball file/url etc. see <a target="_blank" href="https://www.npmjs.org/doc/cli/npm-install.html">npm docs</a>
                            <br /> i.e.
                            <code class="import-code-example">nodebb-plugin-vbexporter</code> or <br />
                            <code class="import-code-example">git://github.com/psychobunny/nodebb-plugin-import-phpbb#master</code> or <br/>
                            <code class="import-code-example">nodebb-plugin-import-ubb@0.1.0</code> etc.<br />
                            if a value exists here, it will take precedence over the select box value right above it.
                        </p>
                        <input type="text" class="form-control" id="exporter-module-input" name="exporter-module-input" placeholder="nodebb-plugin-my-compatible-exporter@0.0.1">
                    </div>

                    <div class="form-group">
                        <h2>Importer Configs</h2>

                        <div class="form-group">
                            <label for="importer-convert">Content conversion</label>
                            <p class="help-block">
                                Convert your posts content, user signatures and topics titles
                                to Markdown (the preferred NodeBB format language).
                                If you have another [from-to] format you want to add, let me know, or pull request it
                            </p>
                            <select class="form-control" id="importer-convert" name="importer-convert">
                                <option value="">Don't convert</option>
                                <option value="bbcode-to-md">BBCode to Markdown</option>
                                <option value="html-to-md">HTML to Markdown</option>
                            </select>
                        </div>

                        <hr />

                        <div class="form-group">
                            <h4 for="importer-templates">Redirection templates</h4>
                            <p class="help-block">
                                These templates allow you to create redirection maps; the importer will spit out logs
                                that include each old path mapped to a relevant new NodeBB one, based on the templates provided.
                                For example, some forums uses IDs in the URLs, some uses slugs. The old paths here are an example of the
                                UBB forum's way, and the disabled ones are the NodeBB way. Change the old paths at will.
                                <br />
                                After the import is done, and you can download the mapped URLs and use them with,
                                either like <a href="http://wiki.nginx.org/HttpMapModule" target="_blank">NGINX MapModule</a> or this lite <a href="https://github.com/akhoury/RedirectBB" target="_blank">"redirector"</a> that I wrote for this purpose.
                                <br />
                                Note the templating syntax, it uses the <a href="http://underscorejs.org/#template" target="_blank">Underscore.js's template</a>
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
                        </div>

                            <hr />

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
                                <p class="help-block">Auto Generate passwords for users, if no passwords are provided. If checked, this will hit performance, if unchecked, all passwords are NULL so all users will need to reset their passwords before login in. The latter is the recommended behavior</p>
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
                                <label for="importer-autoconfirm-emails">
                                   <input checked type="checkbox" id="importer-autoconfirm-emails" name="importer-autoconfirm-emails"> Auto confirm user accounts
                                </label>
                                <p class="help-block">
                                    Let the importer auto confirm the users new email automatically
                                    <br/>
                                    It will try to set the nodebb 'email:*:confirm' records to true
                                    and also delete all the 'confirm:*KEYS*:emails'
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

                   <button class="btn btn-lg btn-primary pull-right" data-on="click" data-action="saveSettings" id="save" type="button">Save Config</button>
            </div>

            <div class="text-center">
                <i title="Toggle settings" data-target-visible-direction="down" data-on="click" data-action="slideVerticalToggle" data-target=".import-config" class="fa fa-bars import-hand"></i>
            </div>
        </fieldset>

    <div class="import-toolbar import-overflow-hidden">
       <button class="btn btn-lg btn-success" data-on="click" data-action="start" id="import-start" type="button">Delete all current data, export from source then import to NodeBB</button>
       <button class="btn btn-lg btn-danger hidden" data-on="click" data-action="stop" id="import-stop" type="button">Stop</button>

       <button
            title="Attempts to retrieve and download users.csv from your last import run"
            class="btn btn-lg btn-default import-download-btn pull-right disabled"
            disabled="disabled"
            data-on="click"
            data-action="downloadUsersCsv"
            id="download-users-csv"
            type="button">users.csv
       </button>

       <button
            title="Attempts to retrieve and download users.json from your last import run"
            class="btn btn-lg btn-default import-download-btn pull-right disabled"
            disabled="disabled"
            data-on="click"
            data-action="downloadUsersJson"
            id="download-users-json"
            type="button">users.json
       </button>

       <button
            title="Attempts to retrieve and download redirect.map.json of your last import run"
            class="btn btn-lg btn-default import-download-btn pull-right disabled"
            disabled="disabled"
            data-on="click"
            data-action="downloadRedirectionJson"
            id="download-redirection-json"
            type="button">redirect.map.json
       </button>

        <div class="form">
           <div class="checkbox"">
               <label for="importer-log-control-server">
                  <input class="importer-log-control" type="checkbox" id="importer-log-control-server" name="importer-log-control-server"> Save logs on server
               </label>
               <p class="help-block">
                   Try disabling this if the server is crashing due to 'EMFILE too many open files' or 'Segmentation fault'
               </p>
           </div>
           <div class="checkbox">
               <label for="importer-log-control-client">
                  <input class="importer-log-control" type="checkbox" id="importer-log-control-client" name="importer-log-control-client"> Log on client
               </label>
               <p class="help-block">
                   May crash your page.
               </p>
           </div>
           <div class="checkbox">
               <label for="importer-log-control-verbose">
                  <input data-on="click" data-action="toggleVerboseLogs" class="importer-log-control" type="checkbox" id="importer-log-control-verbose" name="importer-log-control-verbose"> Verbose
               </label>
           </div>
        </div>
    </div>
 </form>

    <div class="import-state-container">
        <h4>
            State:
            <span class="controller-state-now">Idle</span> <i class="fa controller-state-icon"></i>,
            by event:
            <span class="controller-state-event">none</span>
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

<script src="/plugins/nodebb-plugin-import/js/acp.js"></script>
