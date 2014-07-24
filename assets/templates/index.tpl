<style>
	.{json.nbbId}-overflow-hidden {
		overflow: hidden;
	}
	.{json.nbbId}-hand {
		cursor: hand;
		cursor: pointer;
	}
</style>

<h1><i class="fa {json.faIcon}"></i> {json.name}</h1>

<form role="form" class="{json.nbbId}-settings">
	<fieldset>

		<div class="col-sm-12 {json.nbbId}-config-wrapper">

			<div class="col-sm-12 {json.nbbId}-config">
				<div class="form-group">
					<label for="log">Log level</label>
					<select class="form-control" id="log" name="log">
						<option val="debug">debug</option>
						<option val="error">error</option>
						<option val="warn">warn</option>
						<option val="info">info</option>
					</select>
				</div>

				<h3>Source Forum</h3>

				<div class="form-group">
					<label for="log">Available Exporter</label>
					<select data-on="change" data-target="" data-action="" class="form-control" id="exporter-module" name="exporter-module">
						<option val="nodebb-plugin-import-ubb">UBB (7.x)</option>
					</select>
				</div>

				<button class="btn btn-lg btn-primary" id="save" type="button">Save Config</button>
			</div>

			<div class="text-center">
				<i data-actions="click:slideToggle" data-target=".{json.nbbId}-config" class="fa fa-bars {json.nbbId}-hand"></i>
			</div>
		</div>

        <hr />

	</fieldset>
</form>

<script src="/plugins/nodebb-plugin-{nbbId}/assets/js/acp.js">
