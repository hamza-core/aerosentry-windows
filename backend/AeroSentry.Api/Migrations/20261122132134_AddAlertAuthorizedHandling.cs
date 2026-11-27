using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122132134_AddAlertAuthorizedHandling : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<byte[]>(
            name: "AlarmSnapshot",
            table: "DetectionEvents",
            type: "varbinary(max)",
            nullable: true);

        migrationBuilder.AddColumn<bool>(
            name: "AutoResponseSkipped",
            table: "Alerts",
            type: "bit",
            nullable: false,
            defaultValue: false);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "AlarmSnapshot",
            table: "DetectionEvents");

        migrationBuilder.DropColumn(
            name: "AutoResponseSkipped",
            table: "Alerts");
    }
}
